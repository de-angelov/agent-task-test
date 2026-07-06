import type { Epic } from "~/services/epics/epics.server";
import type { Team } from "~/services/teams/teams.server";
import { ticketStates, ticketTypes } from "~/services/tickets/ticket-workflow";

export function TicketCreateFields({
  epics = [],
  selectedTeamId = "",
  teams = [],
}: {
  epics?: Epic[];
  selectedTeamId?: string;
  teams?: Team[];
}) {
  return (
    <>
      <label className="form-field">
        <span>Team</span>
        <select defaultValue={selectedTeamId} name="teamId">
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Epic</span>
        <select name="epicId">
          <option value="">No epic</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.title}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Type</span>
        <select defaultValue="feature" name="type">
          {ticketTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>State</span>
        <select defaultValue="backlog" name="state">
          {ticketStates.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Title</span>
        <input name="title" />
      </label>
      <label className="form-field">
        <span>Body</span>
        <textarea name="body" rows={6} />
      </label>
    </>
  );
}
