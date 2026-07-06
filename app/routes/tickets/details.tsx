import { useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import type { CommentReadModel } from "~/services/comments/comments.server";
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
import { ScreenShell } from "../placeholders/placeholder-ui";

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
    .otherwise(() => handleTicketDeleteAction(db, ticketId, formData));
}

function getStateLabel(state: TicketReadModel["state"]) {
  return match(state)
    .with("backlog", () => "Backlog")
    .with("todo", () => "Todo")
    .with("in-progress", () => "In progress")
    .with("done", () => "Done")
    .exhaustive();
}

function TicketDetailsFields({ ticket }: { ticket: TicketReadModel }) {
  return (
    <dl className="details-list">
      <dt>Title</dt>
      <dd>{ticket.title}</dd>
      <dt>Body</dt>
      <dd>{ticket.body}</dd>
      <dt>Type</dt>
      <dd>{ticket.type}</dd>
      <dt>Team</dt>
      <dd>{ticket.teamName}</dd>
      <dt>Epic</dt>
      <dd>{ticket.epicTitle ?? "No epic"}</dd>
      <dt>State</dt>
      <dd>{getStateLabel(ticket.state)}</dd>
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

function AddCommentForm() {
  return (
    <form className="form-panel" method="post">
      <h2>Add comment</h2>
      <input name="intent" type="hidden" value="add-comment" />
      <label className="form-field">
        <span>Comment</span>
        <textarea name="body" rows={4} />
      </label>
      <Button type="submit" variant="primary">
        Add comment
      </Button>
    </form>
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
  return (
    <ScreenShell title="Ticket details" userEmail={data.userEmail}>
      {actionData ? (
        <p className="placeholder-notice" role="alert">
          {actionData.message}
        </p>
      ) : null}
      {data.status === "found" ? (
        <>
          <TicketDetailsFields ticket={data.ticket} />
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
          <TicketComments
            comments={data.comments}
            currentUserId={data.currentUserId}
          />
          <AddCommentForm />
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
