// ============================================================
// main_flight.js — 航班渲染相关函数
// 依赖 main.js 中的全局变量和工具函数：
//   currentTimeRange, currentCarriers, airportData, filters,
//   getAlertColor(), getSelectedAlertMargin()
// ============================================================

// 更新承运人显示
function updateCarrierDisplay() {
    const carrierDisplay = document.getElementById('carrier-display');
    if (currentCarriers && currentCarriers.length > 0) {
        carrierDisplay.textContent = currentCarriers.join(' ');
    } else {
        carrierDisplay.textContent = '暂无承运人数据';
    }
}

// 加载承运人数据
function loadCarrierData() {
    if (window.carriers && window.carriers.length > 0) {
        currentCarriers = window.carriers;
        updateCarrierDisplay();
    }
}

// 创建航班时间轴 - 使用新的显示方式
function createFlightTimeline(flightData, tafData = null, metarData = null, airport = null) {
    const timeSlots = flightData.time_slots || [];
    let flightInfos = [];

    // 生成航班信息显示
    for (let i = 0; i < currentTimeRange; i++) {
        const flightInfo = timeSlots[i] || '';

        if (flightInfo && flightInfo.trim() !== '' && flightInfo.trim() !== 'None' && flightInfo.trim() !== 'null') {
            // 计算位置（与竖线对应）
            const leftPercent = (i / currentTimeRange) * 100;
            const widthPercent = (1 / currentTimeRange) * 100;

            // 计算告警级别
            const alertLevel = calculateFlightAlertLevel(i, tafData, metarData, flightData, airport);
            const alertColor = alertLevel ? getAlertColor(alertLevel) : '#333';

            flightInfos.push(`
                <div class="flight-info-item" style="
                    position: absolute;
                    left: ${leftPercent}%;
                    width: ${widthPercent}%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: bold;
                    color: ${alertColor};
                    z-index: 2;
                    pointer-events: none;
                ">${flightInfo}</div>
            `);
        }
    }

    return flightInfos.join('');
}

// 计算航班告警级别 - 使用后端预计算结果
function calculateFlightAlertLevel(timeSlotIndex, tafData, metarData, flightData, airport) {
    try {
        // 获取当前选中的告警裕度
        const currentMargin = getSelectedAlertMargin();

        // 从预计算结果中获取对应margin和时段的告警等级
        if (airport && airport.computed_alerts) {
            const marginKey = `margin_${currentMargin}`;
            const marginResults = airport.computed_alerts[marginKey];

            if (marginResults && marginResults.time_slots && timeSlotIndex < marginResults.time_slots.length) {
                return marginResults.time_slots[timeSlotIndex];
            }
        }

        // 如果预计算结果不存在，返回默认值
        return 'N';

    } catch (error) {
        console.error('获取时段告警等级失败:', error);
        return 'N';
    }
}

// 辅助函数：从告警级别列表中获取最高级别
function getMaxAlertFromList(alerts) {
    if (!alerts || alerts.length === 0) return 'N';

    if (alerts.includes('R')) return 'R';
    if (alerts.includes('Y')) return 'Y';
    if (alerts.includes('G')) return 'G';
    return 'N';
}

// 更新航班数据状态警告
function updateFlightStatusWarning(flightStatus) {
    if (!flightStatus) return;

    let warningElement = document.getElementById('flight-status-warning');

    if (!flightStatus.is_available) {
        // 需要显示警告
        if (!warningElement) {
            // 创建警告元素
            warningElement = document.createElement('div');
            warningElement.id = 'flight-status-warning';
            warningElement.innerHTML = '⚠';
            warningElement.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 80px;
                height: 80px;
                background-color: #ffc107;
                color: #212529;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
                font-weight: bold;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                transition: transform 0.2s;
            `;

            // 添加悬浮效果
            warningElement.addEventListener('mouseenter', function () {
                this.style.transform = 'scale(1.1)';
            });

            warningElement.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
            });

            document.body.appendChild(warningElement);
        }

        // 设置提示文字 - 使用数据库中现有航班数据的创建时间
        if (airportData && airportData.length > 0 && airportData[0].flight_data && airportData[0].flight_data.last_updated) {
            const lastUpdated = new Date(airportData[0].flight_data.last_updated);
            const timeString = lastUpdated.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            warningElement.title = `未获取到最新航班数据，当前显示的航班数据为${timeString}获取`;
        } else {
            warningElement.title = `未获取到最新航班数据，当前无可用的航班数据`;
        }

    } else {
        // 不需要显示警告，移除元素
        if (warningElement) {
            warningElement.remove();
        }
    }
}
