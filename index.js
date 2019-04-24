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

const getStatus = (hours, billable) => {
  const colors = [ "", "yellow", "green", "blue", "purple" ];
  let tresholds = [];
  let messages = [];
  if (billable) {
    tresholds = [ 0, 10, 15, 20, 30 ];
    messages = ["bída", "taky něco", "splněno", "slušný", "hvězdně!"]
  } else {
    tresholds = [ 0, 15, 25, 30, 40 ];
    messages = ["prlajs", "cosi je", "celkem je", "máš", "až dost"]
  }
  let index = tresholds.reduce((prev, curr, index) => {
    return hours >= curr ? index : prev;
  });
  return {
    color: colors[index],
    message: messages[index]
  };
};

const getTimeEntries = async (user, startDate, endDate) => {
  return harvest.timeEntries
  .list({ user_id: user.id, from: startDate.toDate(), to: endDate.toDate() })
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

    let billableStatus = getStatus(billable, true);
    let totalStatus = getStatus(total, false);
    userStats += ":" + (billableStatus.color !== "" ? billableStatus.color + "_" : "") + "heart: " + ("  " + billable.toFixed(1)).slice(-4);
    userStats += " / " + ("00" + total.toFixed(1)).slice(-4);
    //userStats += " / :" + (totalStatus.color !== "" ? totalStatus.color + "_" : "") + "heart: " + ("00" + total.toFixed(1)).slice(-4);
    userStats += " - *" + user.first_name + " " + user.last_name + "*";
    //userStats += " (vykázáno " + totalStatus.message + ", v placenejch " + billableStatus.message + ")";
    //userStats += " - https://etneteractivate.harvestapp.com/team/" + user.id + "?week_of=" + startDate.format("YYYY-MM-DD");
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

    const startDate = moment().startOf('week').isoWeekday(1);
    const endDate = startDate.clone().add(7, 'days');
    const userStats = await Promise.all(users.map(user => getTimeEntries(user, startDate, endDate)));

    //const url = config.SLACK_WEBHOOK_URL;      // send to #wata
    const url = config.SLACK_WEBHOOK_URL_TEST; // send to #test_lce
    const webhook = new IncomingWebhook(url);
    // Send the notification
    const message = "Statistiky za období " + startDate.format("D.M.YYYY") + " - " + endDate.format("D.M.YYYY") + "\n" + userStats.join("\n");
    console.log("Sending message:\n" + message);

    await webhook.send({
      text: message,
    });
  } catch (err) {
    console.error(err);
    return err;
  }
})();