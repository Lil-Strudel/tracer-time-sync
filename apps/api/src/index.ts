import { Context, APIGatewayProxyCallback, APIGatewayEvent } from "aws-lambda";
import { db } from "./db";
import { usersTable } from "./db/schema";

type APIGatewayHandler = (
  event: APIGatewayEvent,
  context: Context,
  callback: APIGatewayProxyCallback,
) => Promise<void>;

function logRequest(event: APIGatewayEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);
}

export const getRoot: APIGatewayHandler = async (event, context, callback) => {
  logRequest(event, context);

  const users = await db.select().from(usersTable);

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ users }),
  });
};

export const postUser: APIGatewayHandler = async (event, context, callback) => {
  logRequest(event, context);

  const body: typeof usersTable.$inferInsert = {
    name: "John",
    age: 30,
    email: "john@example.com",
  };

  const [user] = await db.insert(usersTable).values(body).returning();

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ user }),
  });
};
