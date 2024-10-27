console.log("Content script loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message in content script:", request);
  if (request.action === "checkTimeline") {
    console.log("Checking for timeline");
    waitForTimelineContent();
  }
});

function waitForTimelineContent(attempts = 0) {
  const maxAttempts = 30; // 增加最大尝试次数
  const timelineSection = document.querySelector('section[data-block="timeline"]');
  if (timelineSection) {
    const eventList = timelineSection.querySelector('[data-region="event-list-content"]');
    if (eventList) {
      console.log("Event list found, waiting for content...");
      waitForEvents(eventList, attempts);
    } else if (attempts < maxAttempts) {
      console.log(`Waiting for event list... (Attempt ${attempts + 1}/${maxAttempts})`);
      setTimeout(() => waitForTimelineContent(attempts + 1), 1000);
    } else {
      console.log("Event list not found after maximum attempts");
    }
  } else {
    console.log("Timeline section not found");
  }
}

function waitForEvents(eventList, attempts = 0) {
  const maxAttempts = 30;
  if (eventList.querySelector('.list-group-item')) {
    console.log("Events found");
    const timelineData = extractTimelineData(eventList);
    console.log("Extracted timeline data:", timelineData);
    chrome.runtime.sendMessage({action: "logTimeline", data: timelineData});
  } else if (attempts < maxAttempts) {
    console.log(`Waiting for events to load... (Attempt ${attempts + 1}/${maxAttempts})`);
    setTimeout(() => waitForEvents(eventList, attempts + 1), 1000);
  } else {
    console.log("No events found after maximum attempts");
  }
}

function extractTimelineData(eventList) {
  const data = {
    title: "Timeline",
    events: []
  };

  const eventGroups = eventList.querySelectorAll('.border-bottom');
  console.log(`Found ${eventGroups.length} event groups`);

  eventGroups.forEach((group, groupIndex) => {
    const dateElement = group.querySelector('h5');
    const groupDate = dateElement ? dateElement.textContent.trim() : '';
    console.log(`Processing event group ${groupIndex + 1}, Date: ${groupDate}`);

    const eventItems = group.querySelectorAll('.list-group-item');
    console.log(`Found ${eventItems.length} events in this group`);

    eventItems.forEach((event, index) => {
      console.log(`Processing event ${index + 1} in group ${groupIndex + 1}`);
      const eventData = {
        title: "",
        course: "",
        date: groupDate,
        time: "",
        type: "",
        url: ""
      };

      const titleElement = event.querySelector('.event-name');
      if (titleElement) {
        eventData.title = titleElement.textContent.trim();
        console.log(`Event title: ${eventData.title}`);

        // 从 aria-label 属性中提取准确的日期和时间
        const ariaLabel = titleElement.closest('a').getAttribute('aria-label');
        const dateTimeMatch = ariaLabel.match(/is due on (\d+ \w+ \d+), (\d+:\d+ [AP]M)/);
        if (dateTimeMatch) {
          eventData.date = dateTimeMatch[1];
          eventData.time = dateTimeMatch[2];
          console.log(`Extracted date and time from aria-label: ${eventData.date}, ${eventData.time}`);
        }
      }

      const courseElement = event.querySelector('.text-muted');
      if (courseElement) {
        eventData.course = courseElement.textContent.trim();
        console.log(`Event course: ${eventData.course}`);
      }

      const timeElement = event.querySelector('.text-right');
      if (timeElement) {
        // 只有在从 aria-label 中没有提取到时间时才使用这个时间
        if (!eventData.time) {
          eventData.time = timeElement.textContent.trim();
        }
        console.log(`Event time: ${eventData.time}`);
      }

      const typeElement = event.querySelector('img.icon');
      if (typeElement) {
        eventData.type = typeElement.getAttribute('alt');
        console.log(`Event type: ${eventData.type}`);
      }

      const linkElement = event.querySelector('a');
      if (linkElement) {
        eventData.url = linkElement.href;
        console.log(`Event URL: ${eventData.url}`);
      }

      data.events.push(eventData);
    });
  });

  return data;
}
