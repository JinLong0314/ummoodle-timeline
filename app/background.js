import { clientId, clientSecret } from './config.js';
let timelineData = null;
let accessToken = '';
const redirectUri = chrome.identity.getRedirectURL();

console.log("Redirect URI:", chrome.identity.getRedirectURL());

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("Tab updated:", tab.url);
  if (changeInfo.status === 'complete' && tab.url.includes('ummoodle.um.edu.mo')) {
    console.log("Sending checkTimeline message");
    chrome.tabs.sendMessage(tabId, {action: "checkTimeline"});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  getAuthToken();
});

function getAuthToken() {
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/calendar`;

  console.log("Launching web auth flow with URL:", authUrl);

  chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  }, function(redirectUrl) {
    if (chrome.runtime.lastError) {
      console.error("Error in launchWebAuthFlow:", chrome.runtime.lastError);
    } else if (redirectUrl) {
      console.log("Received redirect URL:", redirectUrl);
      const url = new URL(redirectUrl);
      const hash = url.hash.substring(1);
      const params = new URLSearchParams(hash);
      accessToken = params.get('access_token');
      if (accessToken) {
        console.log('Access token obtained');
      } else {
        console.error('No access token found in redirect URL');
      }
    } else {
      console.error('No redirect URL received');
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);
  if (request.action === "logTimeline") {
    console.log("Timeline 详细信息:", request.data);
    chrome.storage.local.get(['timelineData'], function(result) {
      const oldData = result.timelineData;
      if (JSON.stringify(oldData) !== JSON.stringify(request.data)) {
        console.log("Timeline data has changed. Syncing to Google Calendar...");
        chrome.storage.local.set({timelineData: request.data}, function() {
          console.log('New timeline data saved');
          syncToGoogleCalendar(request.data.events);
        });
      } else {
        console.log("Timeline data has not changed.");
      }
    });
  } else if (request.action === "getTimelineData") {
    chrome.storage.local.get(['timelineData'], function(result) {
      sendResponse({data: result.timelineData});
    });
    return true; // 保持消息通道开放，以便异步发送响应
  } else if (request.action === "refreshData") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('ummoodle.um.edu.mo')) {
        chrome.tabs.reload(tabs[0].id, function() {
          sendResponse({success: true});
        });
      } else {
        chrome.tabs.create({url: 'https://ummoodle.um.edu.mo/login'}, function(tab) {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (info.status === 'complete' && tabId === tab.id) {
              chrome.tabs.onUpdated.removeListener(listener);
              sendResponse({success: true});
            }
          });
        });
      }
    });
    return true; // 保持消息通道开放，以便异步发送响应
  } else if (request.action === "syncToCalendar") {
    if (!accessToken) {
      getAuthToken();
    } else {
      syncToGoogleCalendar(request.events);
    }
  }
});

function syncToGoogleCalendar(events) {
  if (!accessToken) {
    console.error("No access token available");
    getAuthToken();
    return;
  }

  console.log("Syncing events to Google Calendar:", events);

  events.forEach(event => {
    if (!event.date || !event.time) {
      console.error("Invalid event data:", event);
      return;
    }

    checkExistingEvent(event).then(exists => {
      if (!exists) {
        addEventToCalendar(event);
      } else {
        console.log(`Event "${event.title}" already exists in the calendar.`);
      }
    }).catch(error => {
      console.error("Error during event sync:", error);
    });
  });
}

function checkExistingEvent(event) {
  console.log("Checking existing event:", event);
  
  // 验证日期和时间
  if (!event.date || !event.time) {
    console.error("Invalid event date or time:", event);
    return Promise.resolve(false);
  }

  let eventDateTime;
  try {
    // 解析日期和时间
    const [timePart, ampm] = event.time.split(/\s+/);
    let [hours, minutes] = timePart.split(':').map(Number);

    // 处理 AM/PM
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hours !== 12) {
        hours += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
    }

    // 创建日期对象
    const [day, month, year] = event.date.split(/\s+/);
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
    
    eventDateTime = new Date(year, monthIndex, day, hours, minutes);

    if (isNaN(eventDateTime.getTime())) {
      throw new Error("Invalid date");
    }
  } catch (error) {
    console.error("Error parsing event date:", error, event);
    return Promise.resolve(false);
  }

  const timeMin = new Date(eventDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(eventDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&q=${encodeURIComponent(event.title)}`;

  return fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.items && data.items.length > 0) {
      return data.items.some(item => {
        // 检查标题、时间和内容是否都匹配
        const isSameTitle = item.summary === event.title;
        const isSameTime = new Date(item.start.dateTime).getTime() === eventDateTime.getTime();
        const isSameDescription = item.description === event.course;
        
        console.log("Comparing event:", {
          title: { calendar: item.summary, new: event.title },
          time: { calendar: new Date(item.start.dateTime), new: eventDateTime },
          description: { calendar: item.description, new: event.course }
        });
        
        return isSameTitle && isSameTime && isSameDescription;
      });
    }
    return false;
  })
  .catch(error => {
    console.error('Error checking existing event:', error);
    return false;
  });
}

function addEventToCalendar(event) {
  let eventDateTime;
  try {
    // 解析日期和时间
    const [timePart, ampm] = event.time.split(/\s+/);
    let [hours, minutes] = timePart.split(':').map(Number);

    // 处理 AM/PM
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hours !== 12) {
        hours += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
    }

    // 创建日期对象
    const [day, month, year] = event.date.split(/\s+/);
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
    
    eventDateTime = new Date(year, monthIndex, day, hours, minutes);

    if (isNaN(eventDateTime.getTime())) {
      throw new Error("Invalid date");
    }
  } catch (error) {
    console.error("Error parsing event date:", error, event);
    return;
  }

  const calendarEvent = {
    'summary': event.title,
    'description': event.course,
    'start': {
      'dateTime': eventDateTime.toISOString(),
      'timeZone': 'Asia/Macau'
    },
    'end': {
      'dateTime': new Date(eventDateTime.getTime() + 60 * 60 * 1000).toISOString(),
      'timeZone': 'Asia/Macau'
    },
    'reminders': {
      'useDefault': false,
      'overrides': [
        {'method': 'popup', 'minutes': 24 * 60}
      ]
    }
  };

  console.log("Adding event to calendar:", calendarEvent);

  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(calendarEvent)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('HTTP error ' + response.status);
    }
    return response.json();
  })
  .then(data => console.log('Event created: ', data))
  .catch((error) => {
    console.error('Error:', error);
    if (error.message.includes('401')) {
      console.log("Token might be expired, refreshing...");
      handleExpiredToken();
    }
  });
}

// 添加一个函数来处理令牌过期的情况
function handleExpiredToken() {
  accessToken = '';
  getAuthToken();
}
