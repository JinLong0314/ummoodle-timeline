document.addEventListener('DOMContentLoaded', function() {
    loadTimelineData();

    document.getElementById('refresh-button').addEventListener('click', function() {
        const button = this;
        button.disabled = true;
        button.textContent = '刷新中...';
        chrome.runtime.sendMessage({action: "refreshData"}, function(response) {
            if (response && response.success) {
                loadTimelineData();
            } else {
                alert('刷新数据失败，请稍后再试。');
            }
            button.disabled = false;
            button.textContent = '刷新数据';
        });
    });

    // 设置按钮和模态框
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeButton = settingsModal.querySelector('.close');

    settingsButton.onclick = function() {
        settingsModal.style.display = "block";
        loadCompletedEvents();
    }

    closeButton.onclick = function() {
        settingsModal.style.display = "none";
    }

    window.onclick = function(event) {
        if (event.target == settingsModal) {
            settingsModal.style.display = "none";
        }
    }

    // 修改同步按钮
    const syncButton = document.createElement('button');
    syncButton.textContent = '同步到Google日历和Tasks';
    syncButton.id = 'sync-button';
    document.body.insertBefore(syncButton, document.getElementById('timeline-container'));

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
    const container = document.getElementById('timeline-container');
    container.innerHTML = '<p class="loading">加载中...</p>';
    chrome.storage.local.get(['timelineData', 'eventNotes', 'completedEvents', 'expectedTimes'], function(result) {
        if (result.timelineData) {
            loadCompletedEvents(); // 加载并更新已完成事件列表
            displayTimeline(result.timelineData, result.eventNotes || {}, result.completedEvents || [], result.expectedTimes || {});
            setInterval(() => {
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

    // 按剩余时间排序
    data.events.sort((a, b) => {
        const dateA = parseEventDateTime(a.date, a.time);
        const dateB = parseEventDateTime(b.date, b.time);
        return dateA - dateB;
    });

    data.events.forEach((event, index) => {
        if (completedEvents.includes(event.title)) return;

        const eventElement = document.createElement('div');
        eventElement.className = 'event';
        eventElement.innerHTML = `
            <div class="event-title">${event.title}</div>
            <div class="event-course">${event.course}</div>
            <div class="event-datetime">${event.date} ${event.time}</div>
            <span class="event-type">${event.type}</span>
            <div class="event-countdown" id="countdown-${index}"></div>
            <div class="expected-countdown" id="expected-countdown-${index}"></div>
            <div class="event-note">${notes[event.title] || ''}</div>
            <div class="event-actions">
                <button class="note-button">添加备注</button>
                <button class="set-expected-time">设置预计</button>
                <button class="complete-button">完成事件</button>
                <button class="cancel-expected-time">取消预计</button>
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
            const note = prompt('请输入备注:', notes[event.title] || '');
            if (note !== null) {
                notes[event.title] = note;
                chrome.storage.local.set({eventNotes: notes}, function() {
                    eventElement.querySelector('.event-note').textContent = note;
                });
            }
        });

        eventElement.querySelector('.complete-button').addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('确定要标记这个事件为已完成吗？')) {
                completedEvents.push(event.title);
                chrome.storage.local.set({completedEvents: completedEvents}, function() {
                    eventElement.remove();
                });
            }
        });
        
        eventElement.querySelector('.set-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            const picker = eventElement.querySelector(`#expected-time-picker-${index}`);
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
            
            const dateInput = picker.querySelector(`#expected-date-${index}`);
            const timeInput = picker.querySelector(`#expected-time-${index}`);
            
            if (expectedTimes[event.title]) {
                const expectedDate = new Date(expectedTimes[event.title]);
                dateInput.value = expectedDate.toISOString().split('T')[0];
                timeInput.value = expectedDate.toTimeString().slice(0, 5);
            } else {
                const eventDate = parseEventDateTime(event.date, event.time);
                dateInput.value = eventDate.toISOString().split('T')[0];
                timeInput.value = eventDate.toTimeString().slice(0, 5);
            }
        });

        eventElement.querySelector('.save-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            const dateInput = eventElement.querySelector(`#expected-date-${index}`);
            const timeInput = eventElement.querySelector(`#expected-time-${index}`);
            const expectedTimeString = `${dateInput.value}T${timeInput.value}`;
            expectedTimes[event.title] = expectedTimeString;
            chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
                updateExpectedCountdown(index, expectedTimeString);
                eventElement.querySelector(`#expected-time-picker-${index}`).style.display = 'none';
                eventElement.querySelector('.cancel-expected-time').style.display = 'inline-block';
            });
        });

        eventElement.querySelector('.cancel-expected-time').addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('确定要取消预计完成时间吗？')) {
                cancelExpectedTime(event.title, index);
            }
        });

        // 阻止时间选择器内的点击事件冒泡
        eventElement.querySelector(`#expected-time-picker-${index}`).addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        eventElement.addEventListener('click', function() {
            if (event.url) {
                chrome.tabs.create({ url: event.url });
            }
        });
        
        container.appendChild(eventElement);
        
        // 添加淡入动画
        setTimeout(() => {
            eventElement.style.opacity = '0';
            eventElement.style.transform = 'translateY(20px)';
            eventElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            requestAnimationFrame(() => {
                eventElement.style.opacity = '1';
                eventElement.style.transform = 'translateY(0)';
            });
        }, index * 100);

        // 如果有预计完成时间，显示取消按钮，否则显示设置按钮
        if (expectedTimes[event.title]) {
            eventElement.querySelector('.cancel-expected-time').style.display = 'flex';
            eventElement.querySelector('.set-expected-time').style.display = 'none';
        } else {
            eventElement.querySelector('.cancel-expected-time').style.display = 'none';
            eventElement.querySelector('.set-expected-time').style.display = 'flex';
        }
    });

    updateCountdowns();
    updateExpectedCountdowns(expectedTimes);
    
    // 添加这行
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
        const expectedCountdownElement = eventElement.querySelector(`#expected-countdown-${index}`);
        const titleElement = eventElement.querySelector('.event-title');
        const title = titleElement.textContent;
        const cancelButton = eventElement.querySelector('.cancel-expected-time');

        if (expectedCountdownElement && expectedTimes[title]) {
            updateExpectedCountdown(index, expectedTimes[title]);
            if (cancelButton) {
                cancelButton.style.display = 'inline-block';
            }
        } else {
            if (expectedCountdownElement) {
                expectedCountdownElement.textContent = '';
                expectedCountdownElement.style.display = 'none';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
        }
    });
}

function updateExpectedCountdown(index, expectedTimeString) {
    const expectedCountdownElement = document.querySelector(`#expected-countdown-${index}`);
    if (expectedCountdownElement) {
        const expectedDate = new Date(expectedTimeString);
        const updateCountdown = () => {
            const countdown = getCountdown(expectedDate);
            expectedCountdownElement.textContent = `预计: ${countdown}`;
        };
        updateCountdown(); // 立即更新一次
        expectedCountdownElement.style.display = 'block';
        
        // 保存 interval ID 以便之后可以清除
        if (!window.expectedCountdownIntervals) {
            window.expectedCountdownIntervals = {};
        }
        clearInterval(window.expectedCountdownIntervals[index]); // 清除可能存在的旧的 interval
        window.expectedCountdownIntervals[index] = setInterval(updateCountdown, 1000);
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
        completedEvents = completedEvents.filter(eventTitle => {
            const event = timelineData.events.find(e => e.title === eventTitle);
            if (event) {
                const eventDate = parseEventDateTime(event.date, event.time);
                return eventDate > currentDate;
            }
            return false; // 如果找不到事件，也移除
        });

        // 更新存储中的已完成事件列表
        chrome.storage.local.set({completedEvents: completedEvents}, function() {
            displayCompletedEvents(completedEvents);
        });
    });
}

function displayCompletedEvents(completedEvents) {
    const list = document.getElementById('completed-events-list');
    list.innerHTML = '';

    if (completedEvents.length === 0) {
        list.innerHTML = '<li>没有已完成的事件</li>';
        return;
    }

    completedEvents.forEach(event => {
        const li = document.createElement('li');
        li.textContent = event;
        const uncompleteButton = document.createElement('button');
        uncompleteButton.textContent = '取消完成';
        uncompleteButton.className = 'uncomplete-button';
        uncompleteButton.onclick = function() {
            uncompleteEvent(event);
        };
        li.appendChild(uncompleteButton);
        list.appendChild(li);
    });
}

function uncompleteEvent(eventTitle) {
    chrome.storage.local.get(['completedEvents', 'timelineData'], function(result) {
        let completedEvents = result.completedEvents || [];
        completedEvents = completedEvents.filter(e => e !== eventTitle);

        chrome.storage.local.set({completedEvents: completedEvents}, function() {
            loadCompletedEvents(); // 重新加载并显示已完成事件列表
            if (result.timelineData) {
                displayTimeline(result.timelineData, result.eventNotes || {}, completedEvents);
            }
        });
    });
}

function cancelExpectedTime(eventTitle, index) {
    chrome.storage.local.get(['expectedTimes'], function(result) {
        let expectedTimes = result.expectedTimes || {};
        delete expectedTimes[eventTitle];
        chrome.storage.local.set({expectedTimes: expectedTimes}, function() {
            const eventElement = document.querySelector(`.event:nth-child(${index + 1})`);
            if (eventElement) {
                const expectedCountdownElement = eventElement.querySelector(`#expected-countdown-${index}`);
                if (expectedCountdownElement) {
                    expectedCountdownElement.textContent = '';
                    expectedCountdownElement.style.display = 'none';
                }
                const cancelButton = eventElement.querySelector('.cancel-expected-time');
                if (cancelButton) {
                    cancelButton.style.display = 'none';
                }
                // 移除预计完成时间的倒计时
                clearInterval(window.expectedCountdownIntervals[index]);
                delete window.expectedCountdownIntervals[index];
            }
        });
    });
}

