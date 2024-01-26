import {https} from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {eachDayOfInterval, format, isSameDay, subDays} from "date-fns";
import {getAuth} from "firebase-admin/auth";

admin.initializeApp();

export const removeAllAccounts = https.onRequest(async (req, res) => {
  try {
    const {users} = await getAuth().listUsers();

    await Promise.all(users.map(async (user) =>
      getAuth().deleteUser(user.uid)));

    await Promise.all(users.map(async (user) =>
      admin.firestore().collection("users").doc(user.uid).delete()));

    res.status(204).send();
  } catch (e) {
    res.status(400).send({error: "Unable to delete users"});
  }
});

export const generateVictoryDataForPeriod =
https.onRequest(async (req, res) => {
  if (req.headers.authorization) {
    const lastSevenDays = eachDayOfInterval({
      start: new Date(),
      end: subDays(Date.now(), 6),
    }).map((date) => format(date, "yyyy-MM-dd")).reverse();

    const splitToken = req.headers.authorization.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(splitToken);

    const userDb = admin.firestore().collection("users").doc(decodedToken.uid);

    const result = await userDb.get();

    const allPains = [...(result.get("pains") ?? [])];

    const allBowels = [...(result.get("bowel") ?? [])];

    const getPainsForDay = (date: string) => {
      const matchingPains = allPains.filter(({createdDate}) =>
        isSameDay(createdDate, date)).map(({metadata}) => metadata.painScore);

      if (matchingPains.length === 0) return null;

      return matchingPains.reduce( ( p, c ) =>
        p + c, 0 ) / matchingPains.length;
    };

    const getBowelsForDay = (date: string) => {
      const matchingBowels = allBowels.filter(({createdDate}) =>
        isSameDay(createdDate, date));

      if (matchingBowels.length === 0) return null;

      return matchingBowels.length;
    };

    const data = lastSevenDays.map((date) => ({
      date: format(date, "E"),
      pain: getPainsForDay(format(date, "yyyy-MM-dd")),
      bowel: getBowelsForDay(format(date, "yyyy-MM-dd")),
    }));

    res.status(200).send({data: JSON.stringify(data)});
  } else {
    res.status(403).send("No bearer token attached to request");
  }
});

export const generateGraphDataForPeriod = https.onRequest((req, res) => {
  if (req.headers.authorization) {
    res.status(200).send({data: {}});
  } else {
    res.status(403).send("No bearer token on request");
  }
});

export const aggregateResults = https.onRequest(async (req, res) => {
  if (req.headers.authorization) {
    const splitToken = req.headers.authorization.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(splitToken);

    const userDb = admin.firestore().collection("users").doc(decodedToken.uid);

    const result = await userDb.get();

    const lastSevenDays = eachDayOfInterval({
      start: new Date(),
      end: subDays(Date.now(), 6),
    }).map((date) => format(date, "yyyy-MM-dd"));

    const formattedData: { [k in string]: [] } = [
      ...(result.get("medications") ?? []),
      ...(result.get("foods") ?? []),
      ...(result.get("moods") ?? []),
      ...(result.get("pains") ?? []),
      ...(result.get("bowel") ?? []),
    ].reduce((acc, cur: { createdDate: string }) => {
      const formattedDate = format(cur.createdDate, "yyyy-MM-dd");

      if (!lastSevenDays.includes(formattedDate)) return acc;

      if (acc[formattedDate]) {
        acc[formattedDate] = [...acc[formattedDate], cur];
      } else {
        acc[formattedDate] = [cur];
      }

      return acc;
    }, {});

    const dataToReturn = Object.entries(formattedData)
      .map(([date, entries]) => ({
        displayDate: format(date, "EEEE do MMMM y"),
        date,
        sortedEntries: entries.sort(
          (a: { createdDate: string }, b: { createdDate: string }) =>
            b.createdDate.localeCompare(a.createdDate)
        ),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.status(200).send({data: JSON.stringify(dataToReturn)});
  } else {
    res.status(403).send("No bearer token attached to request");
  }
});
