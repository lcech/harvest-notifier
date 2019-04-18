const Harvest = require('harvest').default;
const { IncomingWebhook } = require('@slack/webhook');
const moment = require('moment');
const config = require('./config.json');

const harvest = new Harvest({
  subdomain: 'etneteractivate',
  userAgent: 'Harvest Notifier (ja@lukascech.cz)',
  concurrency: 1,
  auth: {
    accessToken: config.ACCESS_TOKEN,
    accountId: config.ACCOUNT_ID
  }
});

const getUsers = async () => {
  return harvest.users
  .list()
  .then((response) => {
    return response.users;
  })
  .catch(err => {
    console.error("Error requesting users.", err);
    return err;
  });
};

const getColor = (hours, billable) => {
  const colors = [ "", "yellow", "green", "blue", "purple" ];
  let tresholds = [];
  if (billable) {
    tresholds = [ 0, 10, 15, 20, 30 ];
  } else {
    tresholds = [ 0, 15, 25, 30, 40 ];
  }
  return colors[tresholds.reduce((prev, curr, index) => {
    return hours >= curr ? index : prev;
  })];
};

const getTimeEntries = async (user) => {
  return harvest.timeEntries
  .list({ user_id: user.id, from: new Date(2019, 3, 15), to: new Date(2019, 3, 22) })
  .then((response) => {
    const time_entries = response.time_entries;
    let userStats = "";
    let total = 0;
    let billable = 0;
    time_entries.forEach((time_entry) => {
      total += Math.ceil(time_entry.hours * 2) / 2;
      if (time_entry.billable) {
        billable += Math.ceil(time_entry.hours * 2) / 2;
      }
    });

    let billableColor = getColor(billable, true);
    let totalColor = getColor(total, false);
    userStats += ":" + (billableColor !== "" ? billableColor + "_" : "") + "heart: " + ("00" + billable.toFixed(1)).slice(-4);
    userStats += " / :" + (totalColor !== "" ? totalColor + "_" : "") + "heart: " + ("00" + total.toFixed(1)).slice(-4);
    userStats += " - " + user.first_name + " " + user.last_name;
    return userStats;
  })
  .catch(err => {
    console.error("Error requesting timeEntries.", err);
    return err;
  })
};

(async () => {
  try {
    let users = await getUsers();

    users = users.filter((user, index) => {
      if (user.is_active && user.roles.indexOf("WATA") !== -1) {
        return true;
      } else {
        return false;
      }
    });

    const userStats = await Promise.all(users.map(user => getTimeEntries(user)));

    //const url = config.SLACK_WEBHOOK_URL;      // send to #wata
    const url = config.SLACK_WEBHOOK_URL_TEST; // send to #test_lce
    const webhook = new IncomingWebhook(url);
    // Send the notification
    const message = userStats.join("\n");
    console.log("Sending message:\n" + message);

    await webhook.send({
      text: message,
    });
  } catch (err) {
    console.error(err);
    return err;
  }
})();