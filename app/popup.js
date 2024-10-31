document.addEventListener('DOMContentLoaded', function() {
    loadTimelineData();

    // 设置按钮和模态框
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const modalContent = settingsModal.querySelector('.modal-content');
    const closeButton = settingsModal.querySelector('.close');

    settingsButton.onclick = function() {
        // 显示模态框背景
        settingsModal.style.display = "block";
        settingsModal.style.opacity = "0";
        
        // 设置初始状态并添加动画
        modalContent.style.transform = "scale(0.7)";
        modalContent.style.opacity = "0";
        
        // 触发动画
        requestAnimationFrame(() => {
            settingsModal.style.transition = "opacity 0.3s ease";
            settingsModal.style.opacity = "1";
            
            modalContent.style.transition = "all 0.3s ease";
            modalContent.style.transform = "scale(1)";
            modalContent.style.opacity = "1";
        });
        
        loadCompletedEvents();
    }

    function closeModal() {
        // 添加关闭动画
        settingsModal.style.transition = "opacity 0.3s ease";
        settingsModal.style.opacity = "0";
        
        modalContent.style.transition = "all 0.3s ease";
        modalContent.style.transform = "scale(0.7)";
        modalContent.style.opacity = "0";
        
        // 等待动画完成后隐藏模态框
        setTimeout(() => {
            settingsModal.style.display = "none";
            // 重置状态
            modalContent.style.transform = "";
            modalContent.style.opacity = "";
        }, 300);
    }

    closeButton.onclick = function() {
        closeModal();
    }

    window.onclick = function(event) {
        if (event.target == settingsModal) {
            closeModal();
        }
    }

    // 修改同步按钮
    const syncButton = document.createElement('button');
    syncButton.textContent = '同步到Google日历和Tasks';
    syncButton.id = 'sync-button';

    syncButton.addEventListener('click', function() {
        chrome.storage.local.get(['timelineData'], function(result) {
            if (result.timelineData && result.timelineData.events) {
                chrome.runtime.sendMessage({action: "syncToCalendar", events: result.timelineData.events});
                alert('正在同步到Google日历和Tasks...');
            } else {
                alert('没有可同步的事件');
            }
        });
    });

    // 在适当的位置添加以下代码
    document.getElementById('reauth-button').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: "reauth"});
    });
});

function loadTimelineData() {
    // 清除主定时器
    if (window.mainCountdownInterval) {
        clearInterval(window.mainCountdownInterval);
    }

    // 清除所有倒计时定时器
    if (window.expectedCountdownIntervals) {
        Object.values(window.expectedCountdownIntervals).forEach(interval => {
            clearInterval(interval);
        });
        window.expectedCountdownIntervals = {};
    }

    const container = document.getElementById('timeline-container');
    container.innerHTML = '<p class="loading">加载中...</p>';
    
    chrome.storage.local.get(['timelineData', 'eventNotes', 'completedEvents', 'expectedTimes'], function(result) {
        if (result.timelineData) {
            loadCompletedEvents();
            displayTimeline(
                result.timelineData, 
                result.eventNotes || {}, 
                result.completedEvents || [], 
                result.expectedTimes || {}
            );
            
            // 设置主定时器更新倒计时
            window.mainCountdownInterval = setInterval(() => {
                updateCountdowns();
                updateExpectedCountdowns(result.expectedTimes || {});
            }, 1000);
        } else {
            container.innerHTML = '<p class="loading">暂无日程数据，请刷新。</p>';
        }
    });
}

function displayTimeline(data, notes, completedEvents, expectedTimes) {
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';

    data.events.sort((a, b) => {
        const dateA = parseEventDateTime(a.date, a.time);
        const dateB = parseEventDateTime(b.date, b.time);
        return dateA - dateB;
    });

    data.events.forEach((event, index) => {
        const eventIdentifier = `${event.title}_${event.course}`;
        
        if (completedEvents.includes(eventIdentifier)) return;

        const eventElement = document.createElement('div');
        eventElement.className = 'event';
        eventElement.innerHTML = `
            <div class="event-title">${event.title}</div>
            <div class="event-course">${event.course}</div>
            <div class="event-datetime">${event.date} ${event.time}</div>
            <span class="event-type">${event.type}</span>
            <div class="event-countdown" id="countdown-${index}"></div>
            <div class="expected-countdown" id="expected-countdown-${index}"></div>
            <div class="event-note">${notes[eventIdentifier] || ''}</div>
            <div class="event-actions">
                <button class="note-button">添加备注</button>
                <button class="set-expected-time">设置预计</button>
                <button class="cancel-expected-time" style="display: none;">取消预计</button>
                <button class="complete-button">完成事件</button>
            </div>
            <div class="expected-time-picker" id="expected-time-picker-${index}">
                <input type="date" id="expected-date-${index}">
                <input type="time" id="expected-time-${index}">
                <button class="save-expected-time">保存</button>
                <button class="cancel-expected-time-picker">取消</button>
            </div>
        `;

        eventElement.querySelector('.note-button').addEventListener('click', function(e) {
            e.stopPropagation();
            const note = prompt('请输入备注:', notes[eventIdentifier] || '');
            if (note !== null) {
                notes[eventIdentifier] = note;
                chrome.storage.local.set({eventNotes: notes}, function() {
                    eventElement.querySelector('.event-note').textContent = note;
                });
            }
        });

        eventElement.querySelector('.complete-button').addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('确定要标记这个事件为已完成吗？')) {
                completedEvents.push(eventIdentifier);
                fadeOut(eventElement, () => {
                    chrome.storage.local.set({completedEvents: completedEvents}, function() {
                        eventElement.remove();
                    });
                });
            }
        });
        
        eventElement.querySelector('.set-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            const picker = eventElement.querySelector(`#expected-time-picker-${index}`);
            
            if (picker.style.display !== 'block') {
                picker.style.display = 'block';
                fadeIn(picker);
                
                const dateInput = picker.querySelector(`#expected-date-${index}`);
                const timeInput = picker.querySelector(`#expected-time-${index}`);
                
                if (expectedTimes[eventIdentifier]) {
                    const expectedDate = new Date(expectedTimes[eventIdentifier]);
                    dateInput.value = expectedDate.toISOString().split('T')[0];
                    timeInput.value = expectedDate.toTimeString().slice(0, 5);
                } else {
                    const eventDate = parseEventDateTime(event.date, event.time);
                    dateInput.value = eventDate.toISOString().split('T')[0];
                    timeInput.value = eventDate.toTimeString().slice(0, 5);
                }
            } else {
                fadeOut(picker, () => {
                    picker.style.display = 'none';
                });
            }
        });

        eventElement.querySelector('.save-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            const dateInput = eventElement.querySelector(`#expected-date-${index}`);
            const timeInput = eventElement.querySelector(`#expected-time-${index}`);
            const expectedTimeString = `${dateInput.value}T${timeInput.value}`;
            const picker = eventElement.querySelector(`#expected-time-picker-${index}`);
            
            fadeOut(picker, () => {
                picker.style.display = 'none';
                expectedTimes[eventIdentifier] = expectedTimeString;
                chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
                    loadTimelineData();
                });
            });
        });

        eventElement.querySelector('.cancel-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('确定要取消预计完成时间吗？')) {
                cancelExpectedTime(eventIdentifier, index);
            }
        });

        eventElement.querySelector(`#expected-time-picker-${index}`).addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        eventElement.addEventListener('click', function() {
            if (event.url) {
                chrome.tabs.create({ url: event.url });
            }
        });
        
        container.appendChild(eventElement);
        
        if (expectedTimes[eventIdentifier]) {
            const cancelButton = eventElement.querySelector('.cancel-expected-time');
            const setButton = eventElement.querySelector('.set-expected-time');
            if (cancelButton) {
                cancelButton.style.display = 'flex';
                setButton.style.display = 'none';
            }
            updateExpectedCountdown(index, expectedTimes[eventIdentifier]);
        }

        setTimeout(() => {
            eventElement.style.opacity = '0';
            eventElement.style.transform = 'translateY(20px)';
            eventElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            requestAnimationFrame(() => {
                eventElement.style.opacity = '1';
                eventElement.style.transform = 'translateY(0)';
            });
        }, index * 100);
    });

    updateCountdowns();
    updateExpectedCountdowns(expectedTimes);
    
    window.expectedCountdownIntervals = window.expectedCountdownIntervals || {};
}

function updateCountdowns() {
    const events = document.querySelectorAll('.event');
    events.forEach((eventElement, index) => {
        const datetimeElement = eventElement.querySelector('.event-datetime');
        const countdownElement = eventElement.querySelector('.event-countdown');

        if (datetimeElement && countdownElement) {
            const datetimeText = datetimeElement.textContent;
            console.log("Original datetime text:", datetimeText);

            const [dateString, timeString] = datetimeText.split(/\s+(?=\d+:\d+)/);
            console.log("Extracted date and time:", dateString, timeString);

            if (!dateString || !timeString) {
                countdownElement.textContent = '日期格式无效';
                console.error("Invalid datetime format:", datetimeText);
                return;
            }
            
            const eventDate = parseEventDateTime(dateString, timeString);
            if (eventDate) {
                const countdown = getCountdown(eventDate);
                countdownElement.textContent = `剩余: ${countdown}`;
            } else {
                countdownElement.textContent = '日期解析失败';
                console.error("Failed to parse date:", dateString, timeString);
            }
        }
    });
}

function updateExpectedCountdowns(expectedTimes) {
    const events = document.querySelectorAll('.event');
    events.forEach((eventElement, index) => {
        const titleElement = eventElement.querySelector('.event-title');
        const courseElement = eventElement.querySelector('.event-course');
        const eventIdentifier = `${titleElement.textContent}_${courseElement.textContent}`;
        
        // 如果这个事件没有预计时间，跳过它
        if (!expectedTimes || !expectedTimes[eventIdentifier]) {
            return; // 使用 return 而不是继续处理
        }

        // 只有当事件有预计时间时才更新
        const expectedCountdownElement = eventElement.querySelector(`#expected-countdown-${index}`);
        const cancelButton = eventElement.querySelector('.cancel-expected-time');
        const setButton = eventElement.querySelector('.set-expected-time');

        if (expectedCountdownElement) {
            const expectedDate = new Date(expectedTimes[eventIdentifier]);
            const countdown = getCountdown(expectedDate);
            expectedCountdownElement.textContent = `预计: ${countdown}`;
            expectedCountdownElement.style.display = 'block';
            
            if (cancelButton) {
                cancelButton.style.display = 'flex';
            }
            if (setButton) {
                setButton.style.display = 'none';
            }
        }
    });
}

function updateExpectedCountdown(index, expectedTimeString) {
    console.log("Updating countdown for index:", index, "with time:", expectedTimeString);
    const expectedCountdownElement = document.querySelector(`#expected-countdown-${index}`);
    if (expectedCountdownElement) {
        const expectedDate = new Date(expectedTimeString);
        const updateCountdown = () => {
            const countdown = getCountdown(expectedDate);
            expectedCountdownElement.textContent = `预计: ${countdown}`;
            expectedCountdownElement.style.display = 'block';
        };
        
        updateCountdown(); // 立即更新一次
        
        // 清除所有可能存在的定时器
        if (window.expectedCountdownIntervals) {
            // 清除所有与该索引相关的定时器
            Object.keys(window.expectedCountdownIntervals).forEach(key => {
                if (key.startsWith(`${index}_`)) {
                    clearInterval(window.expectedCountdownIntervals[key]);
                    delete window.expectedCountdownIntervals[key];
                }
            });
        } else {
            window.expectedCountdownIntervals = {};
        }
        
        // 使用更具体的键来存储定时器
        const timerKey = `${index}_${Date.now()}`;
        window.expectedCountdownIntervals[timerKey] = setInterval(updateCountdown, 1000);
    }
}

function parseEventDateTime(dateString, timeString) {
    console.log("Parsing date and time:", dateString, timeString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // 处理日期字符串
    const dateParts = dateString.trim().split(/,?\s+/);
    console.log("Date parts:", dateParts);
    if (dateParts.length < 3) {
        console.error("Unexpected date format:", dateString);
        return null;
    }
    
    let day, month, year;
    if (dateParts.length === 3) {
        [day, month, year] = dateParts;
    } else if (dateParts.length === 4) {
        [, day, month, year] = dateParts; // 忽略星期几
    } else {
        console.error("Unexpected date format:", dateString);
        return null;
    }
    
    const monthIndex = months.indexOf(month);
    if (monthIndex === -1) {
        console.error("Invalid month:", month);
        return null;
    }

    // 处理时间字符串
    let hours, minutes;
    const timeMatch = timeString.trim().match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        const isPM = timeMatch[3] && timeMatch[3].toUpperCase() === 'PM';
        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }
    } else {
        console.error("Invalid time format:", timeString);
        return null;
    }

    console.log("Parsed date parts:", day, month, year, hours, minutes);

    const date = new Date(year, monthIndex, parseInt(day), hours, minutes);
    console.log("Parsed date:", date);
    return date;
}

function getCountdown(eventDate) {
    if (!(eventDate instanceof Date) || isNaN(eventDate)) {
        return '日期无效';
    }

    const now = new Date();
    const difference = eventDate - now;

    if (difference <= 0) {
        return '已过期';
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    return `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
}

function loadCompletedEvents() {
    chrome.storage.local.get(['completedEvents', 'timelineData'], function(result) {
        let completedEvents = result.completedEvents || [];
        const timelineData = result.timelineData || { events: [] };
        
        // 过滤掉过期的已完成事件
        const currentDate = new Date();
        completedEvents = completedEvents.filter(eventIdentifier => {
            // 从标识符中分离标题和课程
            const [title, course] = eventIdentifier.split('_');
            const event = timelineData.events.find(e => e.title === title && e.course === course);
            if (event) {
                const eventDate = parseEventDateTime(event.date, event.time);
                return eventDate > currentDate;
            }
            return false;
        });

        // 更新存储中的已完成事件列表
        chrome.storage.local.set({completedEvents: completedEvents}, function() {
            displayCompletedEvents(completedEvents, timelineData);
        });
    });
}

function displayCompletedEvents(completedEvents, timelineData) {
    const list = document.getElementById('completed-events-list');
    list.innerHTML = '';

    if (completedEvents.length === 0) {
        list.innerHTML = '<li class="no-completed-events">没有已完成的事件</li>';
        return;
    }

    completedEvents.forEach(eventIdentifier => {
        const [title, course] = eventIdentifier.split('_');
        const li = document.createElement('li');
        li.className = 'completed-event-item';
        li.innerHTML = `
            <div class="completed-event-info">
                <div class="completed-event-title" title="${title}">${title}</div>
                <div class="completed-event-course" title="${course}">${course}</div>
            </div>
            <button class="uncomplete-button">取消完成</button>
        `;
        
        li.querySelector('.uncomplete-button').onclick = function() {
            uncompleteEvent(eventIdentifier);
        };
        
        list.appendChild(li);
    });
}

function uncompleteEvent(eventIdentifier) {
    chrome.storage.local.get(['completedEvents', 'timelineData'], function(result) {
        let completedEvents = result.completedEvents || [];
        completedEvents = completedEvents.filter(e => e !== eventIdentifier);

        chrome.storage.local.set({completedEvents: completedEvents}, function() {
            loadCompletedEvents(); // 重新加载并显示已完成事件列表
            loadTimelineData(); // 重新加载时间线数据
        });
    });
}

function cancelExpectedTime(eventIdentifier, index) {
    const eventElement = document.querySelector(`.event:nth-child(${index + 1})`);
    const expectedCountdownElement = eventElement.querySelector(`#expected-countdown-${index}`);
    
    fadeOut(expectedCountdownElement, () => {
        chrome.storage.local.get(['expectedTimes'], function(result) {
            let expectedTimes = result.expectedTimes || {};
            delete expectedTimes[eventIdentifier];
            chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
                loadTimelineData();
            });
        });
    });
}

// 添加一个通用的动画函数
function animateElement(element, animation) {
    element.style.transition = 'all 0.3s ease';
    Object.keys(animation.from).forEach(key => {
        element.style[key] = animation.from[key];
    });
    
    requestAnimationFrame(() => {
        Object.keys(animation.to).forEach(key => {
            element.style[key] = animation.to[key];
        });
    });
}

// 添加淡出动画函数
function fadeOut(element, callback) {
    animateElement(element, {
        from: {
            opacity: '1',
            transform: 'translateY(0)'
        },
        to: {
            opacity: '0',
            transform: 'translateY(-20px)'
        }
    });

    setTimeout(() => {
        if (callback) callback();
    }, 300);
}

// 添加淡入动画函数
function fadeIn(element) {
    animateElement(element, {
        from: {
            opacity: '0',
            transform: 'translateY(20px)'
        },
        to: {
            opacity: '1',
            transform: 'translateY(0)'
        }
    });
}

// 修改事件完成按钮的处理
eventElement.querySelector('.complete-button').addEventListener('click', function(e) {
    e.stopPropagation();
    if (confirm('确定要标记这个事件为已完成吗？')) {
        completedEvents.push(eventIdentifier);
        fadeOut(eventElement, () => {
            chrome.storage.local.set({completedEvents: completedEvents}, function() {
                eventElement.remove();
            });
        });
    }
});

// 修改设置预计时间的显示/隐藏
eventElement.querySelector('.set-expected-time').addEventListener('click', function(e) {
    e.stopPropagation();
    const picker = eventElement.querySelector(`#expected-time-picker-${index}`);
    
    if (picker.style.display !== 'block') {
        picker.style.display = 'block';
        fadeIn(picker);
        
        const dateInput = picker.querySelector(`#expected-date-${index}`);
        const timeInput = picker.querySelector(`#expected-time-${index}`);
        
        if (expectedTimes[eventIdentifier]) {
            const expectedDate = new Date(expectedTimes[eventIdentifier]);
            dateInput.value = expectedDate.toISOString().split('T')[0];
            timeInput.value = expectedDate.toTimeString().slice(0, 5);
        } else {
            const eventDate = parseEventDateTime(event.date, event.time);
            dateInput.value = eventDate.toISOString().split('T')[0];
            timeInput.value = eventDate.toTimeString().slice(0, 5);
        }
    } else {
        fadeOut(picker, () => {
            picker.style.display = 'none';
        });
    }
});

// 修改取消预计时间的按钮切换
function toggleExpectedTimeButtons(eventElement, showCancel) {
    const cancelButton = eventElement.querySelector('.cancel-expected-time');
    const setButton = eventElement.querySelector('.set-expected-time');
    
    if (showCancel) {
        setButton.style.display = 'none';
        cancelButton.style.display = 'flex';
        fadeIn(cancelButton);
    } else {
        cancelButton.style.display = 'none';
        setButton.style.display = 'flex';
        fadeIn(setButton);
    }
}

// 修改保存预计时间的处理
eventElement.querySelector('.save-expected-time').addEventListener('click', function(e) {
    e.stopPropagation();
    const dateInput = eventElement.querySelector(`#expected-date-${index}`);
    const timeInput = eventElement.querySelector(`#expected-time-${index}`);
    const expectedTimeString = `${dateInput.value}T${timeInput.value}`;
    const picker = eventElement.querySelector(`#expected-time-picker-${index}`);
    
    fadeOut(picker, () => {
        picker.style.display = 'none';
        expectedTimes[eventIdentifier] = expectedTimeString;
        chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
            loadTimelineData();
        });
    });
});

// 修改显示备注输入的动画
eventElement.querySelector('.note-button').addEventListener('click', function(e) {
    e.stopPropagation();
    const noteElement = eventElement.querySelector('.event-note');
    const note = prompt('请输入备注:', notes[eventIdentifier] || '');
    if (note !== null) {
        notes[eventIdentifier] = note;
        chrome.storage.local.set({eventNotes: notes}, function() {
            fadeOut(noteElement, () => {
                noteElement.textContent = note;
                fadeIn(noteElement);
            });
        });
    }
});

// 修改取消预计时间的处理
function cancelExpectedTime(eventIdentifier, index) {
    const eventElement = document.querySelector(`.event:nth-child(${index + 1})`);
    const expectedCountdownElement = eventElement.querySelector(`#expected-countdown-${index}`);
    
    fadeOut(expectedCountdownElement, () => {
        chrome.storage.local.get(['expectedTimes'], function(result) {
            let expectedTimes = result.expectedTimes || {};
            delete expectedTimes[eventIdentifier];
            chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
                loadTimelineData();
            });
        });
    });
}
