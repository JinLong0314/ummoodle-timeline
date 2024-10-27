import { CLIENT_ID, CLIENT_SECRET } from './config.js';
let timelineData = null;
let accessToken = '';
<<<<<<< HEAD
const clientId = CLIENT_ID;
=======
const clientId = '';
const clientSecret = '';
>>>>>>> 2de9e11706f6580321a9d00e96385186a6ed2e21
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

  events.forEach(event => {
    checkExistingEvent(event).then(exists => {
      if (!exists) {
        addEventToCalendar(event);
        addEventToTasks(event);
      } else {
        console.log(`Event "${event.title}" already exists in the calendar.`);
      }
    });
  });
}

function checkExistingEvent(event) {
  const eventDateTime = new Date(event.date + ' ' + event.time);
  const timeMin = new Date(eventDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 1 day before
  const timeMax = new Date(eventDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 1 day after

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&q=${encodeURIComponent(event.title)}`;

  return fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.items && data.items.length > 0) {
      // Check if any of the events match exactly
      return data.items.some(item => 
        item.summary === event.title &&
        new Date(item.start.dateTime).getTime() === eventDateTime.getTime()
      );
    }
    return false;
  })
  .catch(error => {
    console.error('Error checking existing event:', error);
    return false;
  });
}

function addEventToCalendar(event) {
  const eventDateTime = new Date(event.date + ' ' + event.time);
  const calendarEvent = {
    'summary': event.title,
    'description': event.course,
    'start': {
      'dateTime': eventDateTime.toISOString(),
      'timeZone': 'Asia/Macau'
    },
    'end': {
      'dateTime': new Date(eventDateTime.getTime() + 60 * 1000 * 2).toISOString(), // 假设事件持续1小时
      'timeZone': 'Asia/Macau'
    },
    'reminders': {
      'useDefault': false,
      'overrides': [
        {'method': 'popup', 'minutes': 24 * 60} // 设置提醒时间为24小时前（1天）
      ]
    }
  };

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
      promptForAccessToken();
    }
  });
}

// 添加一个函数来处理令牌过期的情况
function handleExpiredToken() {
  accessToken = '';
  getAuthToken();
}

function addEventToTasks(event) {
  const taskList = {
    'title': 'UMMoodle Timeline'
  };

  // 首先创建或获取任务列表
  fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(taskList)
  })
  .then(response => response.json())
  .then(data => {
    const listId = data.id;
    const task = {
      'title': event.title,
      'notes': `Course: ${event.course}\nDate: ${event.date}\nTime: ${event.time}`,
      'due': new Date(event.date + ' ' + event.time).toISOString()
    };

    // 然后在任务列表中创建任务
    return fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(task)
    });
  })
  .then(response => response.json())
  .then(data => console.log('Task created: ', data))
  .catch(error => console.error('Error creating task:', error));
}
