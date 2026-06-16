let state = {
            incomes: [],
            fixedBills: {}, // Keyed by month "YYYY-MM"
            dailyExpenses: [],
            categories: [
                { id: 'food', name: 'Mess', icon: '🍔', color: '#f97316' },
                { id: 'snacks', name: 'Chai & Snacks', icon: '☕', color: '#84cc16' },
                { id: 'travel', name: 'Travel & Auto', icon: '🚌', color: '#10b981' },
                { id: 'mobile', name: 'Fast Food', icon: '🍔', color: '#ec4899' },
                { id: 'books', name: 'Books & Stationary', icon: '📚', color: '#6366f1' },
                { id: 'laundry', name: 'Laundry / Dhobi', icon: '🧺', color: '#a855f7' },
                { id: 'medical', name: 'Medical', icon: '💊', color: '#ef4444' },
                { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#d946ef' },
                { id: 'movies', name: 'Masti & Movies', icon: '🎬', color: '#f43f5e' },
                { id: 'gym', name: 'Gym & Fitness', icon: '🏋️‍♂️', color: '#06b6d4' },
                { id: 'personal', name: 'Personal Care', icon: '💈', color: '#3b82f6' },
                { id: 'others', name: 'other', icon: '📦', color: '#64748b' }
            ],
            savingsGoal: {
                title: 'New Goal',
                target: 0,
                current: 0
            },
            theme: 'light',
            editDailyId: null
        };

        // Cache Handler Callbacks
        let activeConfirmCallback = null;

        // Chart definitions
        let spendingDoughnutChart = null;

        function saveToLocalStorage() {
            localStorage.setItem('pocketpilot_clean_state', JSON.stringify(state));
        }

        function loadFromLocalStorage() {
            const savedState = localStorage.getItem('pocketpilot_clean_state');
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    state = { ...state, ...parsed };
                } catch(e) {
                    console.error("Localstorage recovery failed, using standard config", e);
                }
            }
        }

        // On document setup
        window.onload = function () {
            loadFromLocalStorage();
            initTheme();
            setupCategoryDropdown();
            setupMonthFilter();
            
            document.getElementById('dailyDate').valueAsDate = new Date();
            
            syncUI();
            lucide.createIcons();
        }

        // Toggle Theme Selector
        function initTheme() {
            const htmlEl = document.documentElement;
            if (state.theme === 'dark') {
                htmlEl.classList.add('dark');
                htmlEl.classList.remove('light');
            } else {
                htmlEl.classList.add('light');
                htmlEl.classList.remove('dark');
            }

            document.getElementById('themeToggle').addEventListener('click', () => {
                if (htmlEl.classList.contains('dark')) {
                    htmlEl.classList.remove('dark');
                    htmlEl.classList.add('light');
                    state.theme = 'light';
                } else {
                    htmlEl.classList.add('dark');
                    htmlEl.classList.remove('light');
                    state.theme = 'dark';
                }
                saveToLocalStorage();
                syncUI(); // Re-render charts
            });
        }

        // Setup drop-down categories inside daily expense selector
        function setupCategoryDropdown() {
            const dropdown = document.getElementById('dailyCategory');
            dropdown.innerHTML = state.categories.map(cat => 
                `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
            ).join('');
        }

        // Generate past 12 months select filters
        function setupMonthFilter() {
            const picker = document.getElementById('monthPicker');
            const now = new Date();
            picker.innerHTML = '';
            
            for (let i = 0; i < 12; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                picker.innerHTML += `<option value="${value}">${label}</option>`;
            }
            
            picker.onchange = () => syncUI();
        }

        function getSelectedMonthRange() {
            const pickerVal = document.getElementById('monthPicker').value;
            if (!pickerVal) return null;
            const [year, month] = pickerVal.split('-').map(Number);
            return { year, month };
        }

        // --------------------------------------------------
        // CHART RENDERING ENGINE
        // --------------------------------------------------
        function drawCharts(filteredDaily, activeFixed) {
            const isDark = document.documentElement.classList.contains('dark');

            // Aggregate all spent amount under correct categories
            const spentAggregate = {};
            state.categories.forEach(cat => {
                spentAggregate[cat.id] = 0;
            });

            // Rent, electricity, wifi and water are categorized dynamically
            let rentAmount = parseFloat(activeFixed.rent) || 0;
            let elecAmount = parseFloat(activeFixed.electricity) || 0;
            let wifiAmount = parseFloat(activeFixed.wifi) || 0;
            let waterAmount = parseFloat(activeFixed.water) || 0;

            // 2. Add Daily Expenses
            filteredDaily.forEach(exp => {
                if (spentAggregate[exp.category] !== undefined) {
                    spentAggregate[exp.category] += parseFloat(exp.amount) || 0;
                } else {
                    spentAggregate['others'] += parseFloat(exp.amount) || 0;
                }
            });

            // Calculate total overall spent to compute percentages
            const totalSpentCombined = Object.values(spentAggregate).reduce((sum, val) => sum + val) + rentAmount + elecAmount + wifiAmount + waterAmount;

            // Filter out categories with zero spending for chart display
            const chartLabels = [];
            const chartData = [];
            const chartColors = [];

            // Add fixed bills to circular list
            if (rentAmount > 0) {
                chartLabels.push(`🏠 Room Rent`);
                chartData.push(rentAmount);
                chartColors.push('#3b82f6');
            }
            if (elecAmount > 0) {
                chartLabels.push(`⚡ Electricity Bill`);
                chartData.push(elecAmount);
                chartColors.push('#eab308');
            }
            if (wifiAmount > 0) {
                chartLabels.push(`📶 Net / Wi-Fi Bill`);
                chartData.push(wifiAmount);
                chartColors.push('#a855f7');
            }
            if (waterAmount > 0) {
                chartLabels.push(`💧 Water Bill`);
                chartData.push(waterAmount);
                chartColors.push('#06b6d4');
            }

            state.categories.forEach(cat => {
                const amt = spentAggregate[cat.id];
                if (amt > 0) {
                    chartLabels.push(`${cat.icon} ${cat.name}`);
                    chartData.push(amt);
                    chartColors.push(cat.color || '#6366f1');
                }
            });

            // Render Doughnut Chart
            if (spendingDoughnutChart) {
                spendingDoughnutChart.destroy();
            }

            const ctxDoughnut = document.getElementById('spendingDoughnutChart').getContext('2d');
            
            if (chartData.length > 0) {
                spendingDoughnutChart = new Chart(ctxDoughnut, {
                    type: 'doughnut',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            data: chartData,
                            backgroundColor: chartColors,
                            borderWidth: isDark ? 2 : 1,
                            borderColor: isDark ? '#0f172a' : '#ffffff',
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        plugins: {
                            legend: { display: false }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%'
                    }
                });
            } else {
                // Draw a simple blank/gray doughnut if no data
                spendingDoughnutChart = new Chart(ctxDoughnut, {
                    type: 'doughnut',
                    data: {
                        labels: ['No Data'],
                        datasets: [{
                            data: [1],
                            backgroundColor: [isDark ? '#334155' : '#e2e8f0'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        plugins: { legend: { display: false } },
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%'
                    }
                });
            }

            const legendGrid = document.getElementById('analyticsLegendGrid');
            legendGrid.innerHTML = '';

            // Inject fixed bills inside visual lists
            const fixedBillsToRender = [
                { name: 'Room Rent', amount: rentAmount, icon: '🏠', color: '#3b82f6' },
                { name: 'Electricity Bill', amount: elecAmount, icon: '⚡', color: '#eab308' },
                { name: 'Net / Wi-Fi Bill', amount: wifiAmount, icon: '📶', color: '#a855f7' },
                { name: 'Water Bill', amount: waterAmount, icon: '💧', color: '#06b6d4' }
            ];

            fixedBillsToRender.forEach(bill => {
                if (bill.amount > 0) {
                    const percent = totalSpentCombined > 0 ? ((bill.amount / totalSpentCombined) * 100).toFixed(0) : 0;
                    legendGrid.innerHTML += createLegendCard(bill, percent);
                }
            });

            state.categories.forEach(cat => {
                const amt = spentAggregate[cat.id];
                if (amt > 0) {
                    const percent = totalSpentCombined > 0 ? ((amt / totalSpentCombined) * 100).toFixed(0) : 0;
                    legendGrid.innerHTML += createLegendCard({ name: cat.name, amount: amt, icon: cat.icon, color: cat.color }, percent);
                }
            });

            if (chartData.length === 0) {
                legendGrid.innerHTML = `<p class="text-xs text-slate-400 italic col-span-2">Kharchon ki circular report yahan generate hogi.</p>`;
            }
        }

        function createLegendCard(item, percent) {
            return `
                <div class="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-1.5 text-xs font-bold">
                            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${item.color}"></span>
                            <span>${item.icon} ${item.name}</span>
                        </div>
                        <span class="text-xs font-black text-slate-900 dark:text-white">₹${item.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="flex-1 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div class="h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%; background-color: ${item.color}"></div>
                        </div>
                        <span class="text-[10px] font-black text-slate-400 shrink-0">${percent}%</span>
                    </div>
                </div>
            `;
        }

        // --------------------------------------------------
        // SYNC USER INTERFACE & STATE Math
        // --------------------------------------------------
        function syncUI() {
            const monthRange = getSelectedMonthRange();
            if (!monthRange) return;

            const activeMonthStr = document.getElementById('monthPicker').value;

            // 1. Filtering by Month
            const filteredIncomes = state.incomes.filter(inc => inc.month === activeMonthStr);
            const filteredDaily = state.dailyExpenses.filter(exp => {
                const d = new Date(exp.date);
                return d.getFullYear() === monthRange.year && (d.getMonth() + 1) === monthRange.month;
            });

            // 2. Mathematical sums
            const activeFixed = state.fixedBills[activeMonthStr] || { rent: 0, electricity: 0, wifi: 0, water: 0 };
            const totalFixedSpent = (parseFloat(activeFixed.rent) || 0) + 
                                     (parseFloat(activeFixed.electricity) || 0) + 
                                     (parseFloat(activeFixed.wifi) || 0) + 
                                     (parseFloat(activeFixed.water) || 0);

            const totalDailySpent = filteredDaily.reduce((sum, exp) => sum + exp.amount, 0);
            const overallExpensesSum = totalFixedSpent + totalDailySpent;

            // Calculate live budget limit as cumulative sum of current month's incomes
            const totalIncomeSum = filteredIncomes.reduce((sum, inc) => sum + inc.amount, 0);
            const liveBudget = totalIncomeSum;

            // Remaining Balance relative to Auto-Calculated Income Budget
            const balanceLeft = liveBudget - overallExpensesSum;
            const transactionsCount = filteredIncomes.length + (state.fixedBills[activeMonthStr] ? 1 : 0) + filteredDaily.length;

            // Render stats cards
            document.getElementById('displayBudget').innerText = liveBudget.toLocaleString('en-IN');
            document.getElementById('displayExpenses').innerText = overallExpensesSum.toLocaleString('en-IN');
            document.getElementById('displayBalance').innerText = balanceLeft.toLocaleString('en-IN');
            document.getElementById('displayCount').innerText = transactionsCount;

            // Balance progress colors relative to live budget
            const balancePercent = liveBudget > 0 ? Math.max(0, Math.min(100, (balanceLeft / liveBudget) * 100)) : 0;
            const balanceProgress = document.getElementById('balanceProgress');
            balanceProgress.style.width = `${balancePercent}%`;

            const balanceBg = document.getElementById('balanceBg');
            const balanceIcon = document.getElementById('balanceIcon');

            if (balancePercent < 15) {
                balanceProgress.className = 'bg-rose-500 h-2 rounded-full transition-all duration-500';
                balanceBg.className = 'absolute -right-4 -top-4 w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center transition-all';
                balanceIcon.className = 'w-6 h-6 text-rose-500';
            } else if (balancePercent < 40) {
                balanceProgress.className = 'bg-amber-500 h-2 rounded-full transition-all duration-500';
                balanceBg.className = 'absolute -right-4 -top-4 w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center transition-all';
                balanceIcon.className = 'w-6 h-6 text-amber-500';
            } else {
                balanceProgress.className = 'bg-emerald-500 h-2 rounded-full transition-all duration-500';
                balanceBg.className = 'absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center transition-all';
                balanceIcon.className = 'w-6 h-6 text-emerald-500';
            }

            // Warnings, Charts and Tables updates
            checkBudgetWarnings(overallExpensesSum, liveBudget);
            renderSavingsGoal();
            renderInsights(filteredDaily, overallExpensesSum, totalFixedSpent, liveBudget);
            drawCharts(filteredDaily, activeFixed);
            
            // Draw tables
            renderIncomeTable(filteredIncomes);
            renderFixedTable(activeMonthStr, activeFixed, totalFixedSpent);
            renderDailyTable(filteredDaily);
        }

        // --------------------------------------------------
        // SYSTEM WARNINGS (Modified to track live budget)
        // --------------------------------------------------
        function checkBudgetWarnings(spent, liveBudget) {
            const alertBox = document.getElementById('alertBox');
            const spentPercent = liveBudget > 0 ? (spent / liveBudget) * 100 : 0;
            let html = '';

            // Warn only if liveBudget is set (> 0)
            if (liveBudget > 0) {
                if (spentPercent >= 100) {
                    html = `
                        <div class="p-4 bg-rose-50 dark:bg-rose-950/25 text-rose-800 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40 rounded-2xl flex items-center gap-3">
                            <i data-lucide="alert-octagon" class="w-5 h-5 shrink-0 text-rose-500"></i>
                            <div class="text-xs font-bold">Limit Exceeded! Aapka is mahine ka total kharcha total income se upar chala gaya hai! Control karein.</div>
                        </div>`;
                } else if (spentPercent >= 90) {
                    html = `
                        <div class="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl flex items-center gap-3">
                            <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0 text-amber-500"></i>
                            <div class="text-xs font-bold">High Alert! 90% income kharch ho gayi hai. Emergency funds bacha kar chalein!</div>
                        </div>`;
                } else if (spentPercent >= 80) {
                    html = `
                        <div class="p-4 bg-amber-50/65 dark:bg-amber-950/10 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl flex items-center gap-3">
                            <i data-lucide="info" class="w-5 h-5 shrink-0 text-amber-400"></i>
                            <div class="text-xs font-bold">Warning! Aapka kharcha total income ke 80% tak pahunch chuka hai.</div>
                        </div>`;
                }
            }

            if (html) {
                alertBox.innerHTML = html;
                alertBox.classList.remove('hidden');
                lucide.createIcons();
            } else {
                alertBox.classList.add('hidden');
            }
        }

        // --------------------------------------------------
        // INSIGHTS SYSTEM (Modified to use live budget)
        // --------------------------------------------------
        function renderInsights(dailyList, overallSpent, fixedSpent, liveBudget) {
            const container = document.getElementById('insightsBox');
            if (dailyList.length === 0 && fixedSpent === 0) {
                container.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic">Insights display karne ke liye items add karein.</p>`;
                return;
            }

            let insightsHtml = '';

            // 1. Live budget utilization ratio
            const spentPercent = liveBudget > 0 ? ((overallSpent / liveBudget) * 100).toFixed(0) : 0;
            if (liveBudget > 0) {
                insightsHtml += `
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100/50 dark:border-slate-800/40 rounded-2xl flex items-start gap-3">
                        <i data-lucide="activity" class="w-4.5 h-4.5 text-indigo-500 mt-0.5 shrink-0"></i>
                        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Aapne apni total income budget ka <span class="font-extrabold text-indigo-600 dark:text-indigo-400">${spentPercent}%</span> use kar liya hai.
                        </p>
                    </div>`;
            } else {
                insightsHtml += `
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100/50 dark:border-slate-800/40 rounded-2xl flex items-start gap-3">
                        <i data-lucide="info" class="w-4.5 h-4.5 text-indigo-500 mt-0.5 shrink-0"></i>
                        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Aapne abhi tak is mahine koi Income Entry nahi jodi hai. Kripya Income Entry jodein taaki aapka budget set ho sake.
                        </p>
                    </div>`;
            }

            // 2. Highest Category identification
            const catMap = {};
            dailyList.forEach(exp => {
                catMap[exp.category] = (catMap[exp.category] || 0) + exp.amount;
            });

            let highestCatId = '';
            let highestAmt = 0;
            for (const key in catMap) {
                if (catMap[key] > highestAmt) {
                    highestAmt = catMap[key];
                    highestCatId = key;
                }
            }

            if (highestCatId) {
                const catObj = state.categories.find(c => c.id === highestCatId);
                const catName = catObj ? catObj.name : 'Unknown';
                const percentOnCat = overallSpent > 0 ? ((highestAmt / overallSpent) * 100).toFixed(0) : 0;
                
                insightsHtml += `
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100/50 dark:border-slate-800/40 rounded-2xl flex items-start gap-3">
                        <i data-lucide="alert-circle" class="w-4.5 h-4.5 text-rose-500 mt-0.5 shrink-0"></i>
                        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Sabse jyada kharcha <span class="font-bold text-slate-950 dark:text-white">${catName}</span> category par hua (₹${highestAmt.toLocaleString('en-IN')}). Yeh kul spending ka <span class="font-extrabold text-rose-500">${percentOnCat}%</span> hai.
                        </p>
                    </div>`;
            }

            // 3. Peak single item
            let peakSingle = { amount: 0, title: '' };
            dailyList.forEach(exp => {
                if (exp.amount > peakSingle.amount) {
                    peakSingle = exp;
                }
            });

            if (peakSingle.amount > 0) {
                insightsHtml += `
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100/50 dark:border-slate-800/40 rounded-2xl flex items-start gap-3">
                        <i data-lucide="award" class="w-4.5 h-4.5 text-amber-500 mt-0.5 shrink-0"></i>
                        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Daily lists ka sabse bada kharcha: <span class="font-bold text-slate-950 dark:text-white">${peakSingle.title}</span> (₹${peakSingle.amount.toLocaleString('en-IN')}).
                        </p>
                    </div>`;
            }

            container.innerHTML = insightsHtml;
            lucide.createIcons();
        }

        // --------------------------------------------------
        // SAVINGS GOAL LOGIC
        // --------------------------------------------------
        function renderSavingsGoal() {
            const goal = state.savingsGoal;
            document.getElementById('goalTitle').innerText = goal.title;
            document.getElementById('goalAmountText').innerText = goal.target.toLocaleString('en-IN');
            document.getElementById('currentSavingsText').innerText = goal.current.toLocaleString('en-IN');

            const remaining = Math.max(0, goal.target - goal.current);
            document.getElementById('remainingSavingsText').innerText = remaining.toLocaleString('en-IN');

            const percent = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
            document.getElementById('goalPercentText').innerText = `${percent}%`;
            document.getElementById('goalProgressBar').style.width = `${percent}%`;
        }

        document.getElementById('editGoalBtn').addEventListener('click', () => {
            document.getElementById('modalGoalTitle').value = state.savingsGoal.title;
            document.getElementById('modalGoalTarget').value = state.savingsGoal.target;
            document.getElementById('modalGoalCurrent').value = state.savingsGoal.current;

            const modal = document.getElementById('goalModal');
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.remove('scale-95');
        });

        window.closeGoalModal = function() {
            const modal = document.getElementById('goalModal');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.add('scale-95');
        }

        window.saveSavingsGoal = function() {
            const title = document.getElementById('modalGoalTitle').value.trim();
            const target = parseFloat(document.getElementById('modalGoalTarget').value);
            const current = parseFloat(document.getElementById('modalGoalCurrent').value);

            if (!title || isNaN(target) || isNaN(current)) return;

            state.savingsGoal = { title, target, current };
            saveToLocalStorage();
            renderSavingsGoal();
            closeGoalModal();
            showToastNotification("Savings target parameter updated!");
        }

        // --------------------------------------------------
        // CUSTOM CATEGORIES CREATOR
        // --------------------------------------------------
        document.getElementById('customCategoryTrigger').addEventListener('click', () => {
            const modal = document.getElementById('categoryModal');
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.remove('scale-95');
        });

        window.closeCategoryModal = function() {
            const modal = document.getElementById('categoryModal');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.add('scale-95');
        }

        window.saveCustomCategory = function() {
            const name = document.getElementById('modalCategoryName').value.trim();
            const icon = document.getElementById('modalCategoryIcon').value.trim() || '🏷️';

            if (!name) return;

            const id = name.toLowerCase().replace(/\s+/g, '-');

            if (!state.categories.find(c => c.id === id)) {
                const randomColors = ['#f43f5e', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];
                const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)];

                state.categories.push({ id, name, icon, color: randomColor });
                saveToLocalStorage();
                setupCategoryDropdown();
                showToastNotification(`Custom tag "${name}" successfully created!`);
            }
            closeCategoryModal();
            syncUI();
        }

        // --------------------------------------------------
        // ACTION HANDLERS (Add / Delete / Update)
        // --------------------------------------------------
        // Note: Manual budget updater function is deprecated and removed as budget is calculated automatically from Incomes.

        // Form 1: Save Income
        document.getElementById('incomeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('incomeAmount').value);
            const source = document.getElementById('incomeSource').value.trim();
            const monthStr = document.getElementById('monthPicker').value;

            if (isNaN(amount) || !source) return;

            state.incomes.push({
                id: Date.now().toString(),
                amount,
                source,
                month: monthStr,
                date: new Date().toISOString().split('T')[0]
            });

            saveToLocalStorage();
            e.target.reset();
            syncUI();
            showToastNotification("Income transaction saved successfully!");
        });

        // Form 2: Save Fixed bills
        document.getElementById('fixedBillsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const monthStr = document.getElementById('monthPicker').value;
            
            state.fixedBills[monthStr] = {
                rent: parseFloat(document.getElementById('fixedRent').value) || 0,
                electricity: parseFloat(document.getElementById('fixedElectricity').value) || 0,
                wifi: parseFloat(document.getElementById('fixedWiFi').value) || 0,
                water: parseFloat(document.getElementById('fixedWater').value) || 0
            };

            saveToLocalStorage();
            syncUI();
            showToastNotification("Monthly fixed bills registered successfully!");
        });

        // Form 3: Daily Expense Form submission
        document.getElementById('dailyExpenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('dailyTitle').value.trim();
            const amount = parseFloat(document.getElementById('dailyAmount').value);
            const date = document.getElementById('dailyDate').value;
            const category = document.getElementById('dailyCategory').value;
            const notes = document.getElementById('dailyNotes').value.trim();

            if (!title || isNaN(amount) || !date) return;

            if (state.editDailyId) {
                // Update
                state.dailyExpenses = state.dailyExpenses.map(exp => {
                    if (exp.id === state.editDailyId) {
                        return { ...exp, title, amount, date, category, notes };
                    }
                    return exp;
                });
                state.editDailyId = null;
                document.getElementById('submitDailyBtn').innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Save Daily Expense`;
                document.getElementById('cancelEditBtn').classList.add('hidden');
                showToastNotification("Daily transaction record updated!");
            } else {
                // Add new
                state.dailyExpenses.push({
                    id: Date.now().toString(),
                    title,
                    amount,
                    date,
                    category,
                    notes
                });
                showToastNotification("Daily transaction record added!");
            }

            saveToLocalStorage();
            e.target.reset();
            document.getElementById('dailyDate').valueAsDate = new Date();
            syncUI();
        });

        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            state.editDailyId = null;
            document.getElementById('dailyExpenseForm').reset();
            document.getElementById('dailyDate').valueAsDate = new Date();
            document.getElementById('submitDailyBtn').innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Save Daily Expense`;
            document.getElementById('cancelEditBtn').classList.add('hidden');
        });

        // Delete Income
        window.deleteIncome = function(id) {
            triggerCustomConfirm(
                "Delete Income Record",
                "Kya aap sach mein is income log ko delete karna chahte hain?",
                () => {
                    state.incomes = state.incomes.filter(inc => inc.id !== id);
                    saveToLocalStorage();
                    syncUI();
                    showToastNotification("Income transaction deleted.");
                }
            );
        }

        // Edit Daily expense
        window.editDailyExpense = function(id) {
            const exp = state.dailyExpenses.find(x => x.id === id);
            if (!exp) return;

            document.getElementById('dailyTitle').value = exp.title;
            document.getElementById('dailyAmount').value = exp.amount;
            document.getElementById('dailyDate').value = exp.date;
            document.getElementById('dailyCategory').value = exp.category;
            document.getElementById('dailyNotes').value = exp.notes || '';

            state.editDailyId = id;
            document.getElementById('submitDailyBtn').innerHTML = `<i data-lucide="edit-3" class="w-4 h-4"></i> Update Daily Expense`;
            document.getElementById('cancelEditBtn').classList.remove('hidden');

            document.getElementById('add-transaction-section').scrollIntoView({ behavior: 'smooth' });
        }

        // Delete Daily expense
        window.deleteDailyExpense = function(id) {
            triggerCustomConfirm(
                "Delete Daily Log",
                "Kya aap sach mein is daily expense ko delete karna chahte hain?",
                () => {
                    state.dailyExpenses = state.dailyExpenses.filter(exp => exp.id !== id);
                    saveToLocalStorage();
                    syncUI();
                    showToastNotification("Daily transaction record deleted.");
                }
            );
        }

        // --------------------------------------------------
        // TABLE RENDERERS
        // --------------------------------------------------
        function renderIncomeTable(incomeList) {
            const tbody = document.getElementById('incomeTableBody');
            tbody.innerHTML = '';

            if (incomeList.length === 0) {
                document.getElementById('incomeEmpty').classList.remove('hidden');
                return;
            }
            document.getElementById('incomeEmpty').classList.add('hidden');

            incomeList.forEach(inc => {
                const dateObj = new Date(inc.date);
                const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors';
                row.innerHTML = `
                    <td class="px-6 py-4">
                        <p class="font-extrabold text-slate-850 dark:text-slate-200">${inc.source}</p>
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold">${formattedDate}</span>
                    </td>
                    <td class="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">₹${inc.amount.toLocaleString('en-IN')}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="window.deleteIncome('${inc.id}')" class="p-2 text-slate-400 hover:text-rose-500 rounded-xl transition-all" title="Delete">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            lucide.createIcons();
        }

        function renderFixedTable(month, bills, total) {
            const tbody = document.getElementById('fixedTableBody');
            tbody.innerHTML = '';

            if (!bills || total === 0) {
                document.getElementById('fixedEmpty').classList.remove('hidden');
                return;
            }
            document.getElementById('fixedEmpty').classList.add('hidden');

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors';
            row.innerHTML = `
                <td class="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">${month}</td>
                <td class="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">₹${(bills.rent || 0).toLocaleString('en-IN')}</td>
                <td class="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">₹${(bills.electricity || 0).toLocaleString('en-IN')}</td>
                <td class="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">₹${(bills.wifi || 0).toLocaleString('en-IN')}</td>
                <td class="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">₹${(bills.water || 0).toLocaleString('en-IN')}</td>
                <td class="px-6 py-4 text-right font-black text-rose-600 dark:text-rose-400">₹${total.toLocaleString('en-IN')}</td>
            `;
            tbody.appendChild(row);
        }

        function renderDailyTable(dailyList) {
            const tbody = document.getElementById('dailyTableBody');
            tbody.innerHTML = '';

            if (dailyList.length === 0) {
                document.getElementById('dailyEmpty').classList.remove('hidden');
                return;
            }
            document.getElementById('dailyEmpty').classList.add('hidden');

            dailyList.forEach(exp => {
                const catObj = state.categories.find(c => c.id === exp.category) || { name: 'Others', icon: '📦' };
                const dateObj = new Date(exp.date);
                const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors';
                row.innerHTML = `
                    <td class="px-6 py-4 font-bold text-slate-400 dark:text-slate-500 text-xs">${formattedDate}</td>
                    <td class="px-6 py-4">
                        <p class="font-extrabold text-slate-850 dark:text-slate-200 leading-tight">${exp.title}</p>
                        ${exp.notes ? `<p class="text-[11px] text-slate-400 font-medium mt-1 italic">${exp.notes}</p>` : ''}
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold border border-indigo-100/20">
                            <span>${catObj.icon}</span> ${catObj.name}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right font-black text-slate-900 dark:text-white">₹${exp.amount.toLocaleString('en-IN')}</td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="window.editDailyExpense('${exp.id}')" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-all" title="Edit">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.deleteDailyExpense('${exp.id}')" class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all" title="Delete">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
            lucide.createIcons();
        }

        // --------------------------------------------------
        // CUSTOM MODALS
        // --------------------------------------------------
        function triggerCustomConfirm(title, message, callback) {
            activeConfirmCallback = callback;
            document.getElementById('confirmTitle').innerText = title;
            document.getElementById('confirmMessage').innerText = message;

            const modal = document.getElementById('confirmModal');
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.remove('scale-95');
        }

        document.getElementById('confirmNoBtn').addEventListener('click', () => {
            closeConfirmModal();
        });

        document.getElementById('confirmYesBtn').addEventListener('click', () => {
            if (activeConfirmCallback) activeConfirmCallback();
            closeConfirmModal();
        });

        function closeConfirmModal() {
            const modal = document.getElementById('confirmModal');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('div').classList.add('scale-95');
            activeConfirmCallback = null;
        }

        window.triggerConfirmReset = function() {
            triggerCustomConfirm(
                "Reset System Logs",
                "Kya aap sach mein saare kharche aur saved history delete karke app reset karna chahte hain?",
                () => {
                    state.incomes = [];
                    state.fixedBills = {};
                    state.dailyExpenses = [];
                    state.savingsGoal = { title: 'New Goal', target: 0, current: 0 };
                    saveToLocalStorage();
                    syncUI();
                    showToastNotification("Ledger cleared and reset!");
                }
            );
        }

        // --------------------------------------------------
        // EXPORT LOGIC
        // --------------------------------------------------
        window.exportCSV = function() {
            if (state.dailyExpenses.length === 0) {
                showToastNotification("Data sheet empty!");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Date,Title,Category,Amount,Notes\n";

            state.dailyExpenses.forEach(exp => {
                const catObj = state.categories.find(c => c.id === exp.category);
                const catName = catObj ? catObj.name : 'Others';
                csvContent += `"${exp.date}","${exp.title}","${catName}","${exp.amount}","${exp.notes || ''}"\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `PocketPilot_Report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToastNotification("CSV Sheet exported successfully!");
        }

        window.exportPDF = function() {
            const element = document.body;
            const opt = {
                margin:       10,
                filename:     `PocketPilot_Report_${new Date().toISOString().split('T')[0]}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };
            
            showToastNotification("Generating premium PDF ledger report...");
            html2pdf().set(opt).from(element).save();
        }

        function showToastNotification(message) {
            const toast = document.getElementById('toast');
            document.getElementById('toastMessage').innerText = message;
            toast.classList.remove('opacity-0', 'pointer-events-none');
            toast.classList.add('translate-y-[-10px]', 'opacity-100');

            setTimeout(() => {
                toast.classList.add('opacity-0', 'pointer-events-none');
                toast.classList.remove('translate-y-[-10px]', 'opacity-100');
            }, 3000);
        }