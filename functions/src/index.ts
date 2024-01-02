import {https} from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {format} from "date-fns";

admin.initializeApp();

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


    const userDb = admin.firestore().collection("users")
      .doc(decodedToken.uid);

    const result = await userDb.get();

    const formattedData: {[k in string]: []} = [
      ...(result.get("medications") ?? []),
      ...(result.get("foods") ?? []),
      ...(result.get("moods") ?? []),
    ].reduce((acc, cur: {createdDate: string}) => {
      const formattedDate = format(cur.createdDate, "yyyy-MM-dd");

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
        sortedEntries: entries
          .sort((a: {createdDate: string}, b: {createdDate: string}) =>
            b.createdDate.localeCompare(a.createdDate)),
      })).sort((a, b) => new Date(b.date).getTime() -
      new Date(a.date).getTime());

    res.status(200).send({data: JSON.stringify(dataToReturn)});
  } else {
    res.status(403).send("No bearer token attached to request");
  }
});
