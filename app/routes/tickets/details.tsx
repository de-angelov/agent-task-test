import { useEffect, useState } from "react";
import { useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { Dialog } from "~/components/dialog";
import { ScreenShell } from "~/components/screen-shell";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import type { CommentReadModel } from "~/services/comments/comments.server";
import type { TicketActivityReadModel } from "~/services/ticket-activity/ticket-activity.server";
import type { TicketReadModel } from "~/services/tickets/tickets.server";

import {
  handleTicketAddCommentAction,
  handleTicketDeleteAction,
  handleTicketDeleteCommentAction,
  handleTicketEditCommentAction,
  readTicketDetails,
  type LoaderData,
  type TicketAddCommentActionData,
  type TicketDeleteActionData,
  type TicketDeleteCommentActionData,
  type TicketEditCommentActionData,
} from "./details.server";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

export function meta() {
  return [{ title: "Ticket Details" }];
}

export async function loader({ request, params }: LoaderArgs) {
  const user = await requireAuthenticatedUser(request);

  const { db } = await import("~/db/client.server");

  return readTicketDetails(db, params.ticketId ?? "", user.id, user.email);
}

export async function action({ request, params }: LoaderArgs) {
  const user = await requireAuthenticatedUser(request);

  const { db } = await import("~/db/client.server");

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const ticketId = params.ticketId ?? "";

  return match(intent)
    .with("add-comment", () =>
      handleTicketAddCommentAction(db, ticketId, user.id, formData),
    )
    .with("edit-comment", () =>
      handleTicketEditCommentAction(db, ticketId, user.id, formData),
    )
    .with("delete-comment", () =>
      handleTicketDeleteCommentAction(db, ticketId, user.id, formData),
    )
    .otherwise(() => handleTicketDeleteAction(db, ticketId, user.id, formData));
}

function getStateLabel(state: TicketReadModel["state"]) {
  return match(state)
    .with("backlog", () => "Backlog")
    .with("todo", () => "Todo")
    .with("in-progress", () => "In progress")
    .with("done", () => "Done")
    .exhaustive();
}

function getActivityActionLabel(actionType: string) {
  return match(actionType)
    .with("created", () => "Ticket created")
    .with("state-changed", () => "State changed")
    .with("title-changed", () => "Title changed")
    .with("body-changed", () => "Body changed")
    .with("team-changed", () => "Team changed")
    .with("epic-changed", () => "Epic changed")
    .with("deleted", () => "Ticket deleted")
    .otherwise(() => actionType);
}

function TicketActivityList({ activity }: { activity: TicketActivityReadModel[] }) {
  return (
    <section className="details-list">
      <h2>Activity</h2>
      {activity.length === 0 ? (
        <p role="status">No activity yet.</p>
      ) : (
        <ul>
          {activity.map((entry) => (
            <li key={entry.id}>
              <p>
                <strong>{getActivityActionLabel(entry.actionType)}</strong>{" "}
                by {entry.actorEmail}{" "}
                <time dateTime={entry.createdAt}>{entry.createdAt}</time>
              </p>
              {entry.detail ? <p>{entry.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TicketHeader({ ticket }: { ticket: TicketReadModel }) {
  return (
    <section aria-label="Ticket header" className="toolbar">
      <h2>{ticket.title}</h2>
      <span>{`Type: ${ticket.type}`}</span>
      <span>{`State: ${getStateLabel(ticket.state)}`}</span>
      {ticket.epicTitle ? <span>{`Epic: ${ticket.epicTitle}`}</span> : null}
    </section>
  );
}

function TicketDetailsFields({ ticket }: { ticket: TicketReadModel }) {
  return (
    <section className="details-list">
      <h2>Details</h2>
      <dl>
        <dt>Body</dt>
        <dd>{ticket.body}</dd>
        <dt>Team</dt>
        <dd>{ticket.teamName}</dd>
        <dt>Epic</dt>
        <dd>{ticket.epicTitle ?? "No epic"}</dd>
        <dt>Created by</dt>
        <dd>{ticket.createdByEmail}</dd>
        <dt>Created timestamp</dt>
        <dd>
          <time dateTime={ticket.createdAt}>{ticket.createdAt}</time>
        </dd>
        <dt>Modified timestamp</dt>
        <dd>
          <time dateTime={ticket.modifiedAt}>{ticket.modifiedAt}</time>
        </dd>
      </dl>
    </section>
  );
}

function EditCommentForm({ comment }: { comment: CommentReadModel }) {
  return (
    <form className="form-panel" method="post">
      <input name="intent" type="hidden" value="edit-comment" />
      <input name="commentId" type="hidden" value={comment.id} />
      <label className="form-field">
        <span>Edit comment</span>
        <textarea defaultValue={comment.body} name="body" rows={3} />
      </label>
      <Button type="submit" variant="secondary">
        Save comment
      </Button>
    </form>
  );
}

function DeleteCommentForm({ commentId }: { commentId: string }) {
  return (
    <form method="post">
      <input name="intent" type="hidden" value="delete-comment" />
      <input name="commentId" type="hidden" value={commentId} />
      <Button type="submit" variant="destructive">
        Delete comment
      </Button>
    </form>
  );
}

function TicketComments({
  comments,
  currentUserId,
}: {
  comments: CommentReadModel[];
  currentUserId: string;
}) {
  return (
    <section className="details-list">
      <h2>Comments</h2>
      {comments.length === 0 ? (
        <p role="status">No comments yet.</p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <p>
                <strong>{comment.authorEmail}</strong>{" "}
                <time dateTime={comment.createdAt}>{comment.createdAt}</time>
              </p>
              <p>{comment.body}</p>
              {comment.authorId === currentUserId ? (
                <>
                  <EditCommentForm comment={comment} />
                  <DeleteCommentForm commentId={comment.id} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddCommentDialogEntry({
  actionData,
}: {
  actionData?: TicketAddCommentActionData;
}) {
  const [isOpen, setIsOpen] = useState(Boolean(actionData));
  const formId = "add-comment-form";

  useEffect(() => {
    if (actionData) {
      setIsOpen(true);
    }
  }, [actionData]);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Add comment</Button>
      <Dialog
        cancelAction={
          <Button onClick={() => setIsOpen(false)} variant="secondary">
            Cancel
          </Button>
        }
        confirmAction={
          <Button form={formId} type="submit" variant="primary">
            Add comment
          </Button>
        }
        isOpen={isOpen}
        onCancel={() => setIsOpen(false)}
        title="Add comment"
      >
        {actionData ? (
          <p className="placeholder-notice" role="alert">
            {actionData.message}
          </p>
        ) : null}
        <form className="form-panel" id={formId} method="post">
          <input name="intent" type="hidden" value="add-comment" />
          <label className="form-field">
            <span>Comment</span>
            <textarea name="body" rows={4} />
          </label>
        </form>
      </Dialog>
    </>
  );
}

export function TicketDetailsView({
  actionData,
  data,
}: {
  actionData?:
    | TicketDeleteActionData
    | TicketAddCommentActionData
    | TicketEditCommentActionData
    | TicketDeleteCommentActionData;
  data: LoaderData;
}) {
  const addCommentActionData =
    actionData?.intent === "add-comment" ? actionData : undefined;
  const otherActionData =
    actionData && actionData.intent !== "add-comment" ? actionData : undefined;

  return (
    <ScreenShell title="Ticket details" userEmail={data.userEmail}>
      {otherActionData ? (
        <p className="placeholder-notice" role="alert">
          {otherActionData.message}
        </p>
      ) : null}
      {data.status === "found" ? (
        <>
          <TicketHeader ticket={data.ticket} />
          <TicketDetailsFields ticket={data.ticket} />
          <section aria-label="Ticket actions" className="toolbar">
            <a className="button-link" href={`/tickets/${data.ticket.id}/edit`}>
              Edit ticket
            </a>
            <form className="form-panel" method="post">
              <h2>Delete ticket</h2>
              <label className="form-field">
                <input name="confirmDelete" type="checkbox" value="yes" />
                <span>Confirm deletion</span>
              </label>
              <Button type="submit" variant="destructive">
                Delete ticket
              </Button>
            </form>
          </section>
          <TicketComments
            comments={data.comments}
            currentUserId={data.currentUserId}
          />
          <AddCommentDialogEntry actionData={addCommentActionData} />
          <TicketActivityList activity={data.activity} />
        </>
      ) : (
        <p role="status">Ticket {data.ticketId} was not found.</p>
      )}
    </ScreenShell>
  );
}

export default function TicketDetails() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return <TicketDetailsView actionData={actionData} data={data} />;
}
