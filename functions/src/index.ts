import {https} from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {eachDayOfInterval, format, isSameDay, subDays} from "date-fns";
import {getAuth} from "firebase-admin/auth";
import {v4 as uuidv4} from "uuid";

admin.initializeApp();

export const getSummaryData = https.onRequest(async (req, res) => {
  if (req.headers.authorization) {
    // Read the token from the request
    const splitToken = req.headers.authorization.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(splitToken);

    // Get the document for the user
    const userDb = admin.firestore().collection("users").doc(decodedToken.uid);

    const userRecord = await userDb.get();

    // Generate the last 7 days of data
    const lastSevenDays = eachDayOfInterval({
      start: new Date(),
      end: subDays(Date.now(), 6),
    }).map((date) => format(date, "yyyy-MM-dd"));

    const allPains = [...(userRecord.get("pains") ?? [])];
    const allBowels = [...(userRecord.get("bowel") ?? [])];
    const allMoods = [...(userRecord.get("moods") ?? [])];
    const allFoods = [...(userRecord.get("foods") ?? [])];

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

    const chartData = lastSevenDays.map((date) => ({
      date: format(date, "E"),
      pain: getPainsForDay(format(date, "yyyy-MM-dd")),
      bowel: getBowelsForDay(format(date, "yyyy-MM-dd")),
    })).reverse();

    const formattedData: { [k in string]: [] } = [
      ...(allFoods),
      ...(allMoods),
      ...(allPains),
      ...(allBowels),
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

    const summaryData = Object.entries(formattedData)
      .map(([date, entries]) => ({
        displayDate: format(date, "EEEE do MMMM y"),
        date,
        sortedEntries: entries.sort(
          (a: { createdDate: string }, b: { createdDate: string }) =>
            b.createdDate.localeCompare(a.createdDate)
        ),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.status(200).send({data: {
      chartData,
      summaryData,
    }});
  } else {
    res.status(403).send("No access token attached to request");
  }
});

export const retrofitUniqueIds = https.onRequest(async (req, res) => {
  const {users} = await getAuth().listUsers();

  users.forEach(async (user) => {
    const document =
    await admin.firestore().collection("users").doc(user.uid).get();

    const pains: Array<any> | undefined = document.get("pains");
    const bowel: Array<any> | undefined = document.get("bowel");
    const moods: Array<any> | undefined = document.get("moods");
    const foods: Array<any> | undefined = document.get("foods");

    const updatedPains = pains?.map((pain) => ({
      id: pain?.id ?? uuidv4(),
      ...pain,
    }));

    const updatedBowel = bowel?.map((bowel) => ({
      id: bowel?.id ?? uuidv4(),
      ...bowel,
    }));

    const updatedFoods = foods?.map((food) => ({
      id: food?.id ?? uuidv4(),
      ...food,
    }));

    const updatedMoods = moods?.map((mood) => ({
      id: mood?.id ?? uuidv4(),
      ...mood,
    }));


    if (updatedBowel) {
      await admin.firestore().collection("users").doc(user.uid).set({
        bowel: updatedBowel,
      }, {merge: true});
    }

    if (updatedPains) {
      await admin.firestore().collection("users").doc(user.uid).set({
        pains: updatedPains,
      }, {merge: true});
    }

    if (updatedFoods) {
      await admin.firestore().collection("users").doc(user.uid).set({
        foods: updatedFoods,
      }, {merge: true});
    }

    if (updatedMoods) {
      await admin.firestore().collection("users").doc(user.uid).set({
        moods: updatedMoods,
      }, {merge: true});
    }


    res.status(200).send("Added all missing IDs for all users");
  });
});

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
