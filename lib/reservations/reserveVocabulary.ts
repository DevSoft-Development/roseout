export type ReserveVocabulary = {
  customer: string;
  customerPlural: string;
  resource: string;
  resourcePlural: string;
  assignResource: string;
  chooseResource: string;
  readyAction: string;
  seatAction: string;
  seatedStatus: string;
  floorTitle: string;
  floorView: string;
  partyLabel: string;
  partySizeLabel: string;
  arrivalStatus: string;
  completedAction: string;
};

const neutral: ReserveVocabulary = {
  customer: "Guest",
  customerPlural: "Guests",
  resource: "Space",
  resourcePlural: "Spaces",
  assignResource: "Assign space",
  chooseResource: "Choose a space",
  readyAction: "Space ready",
  seatAction: "Start visit",
  seatedStatus: "In progress",
  floorTitle: "Space status",
  floorView: "Manage layout",
  partyLabel: "Group",
  partySizeLabel: "Group size",
  arrivalStatus: "Waiting",
  completedAction: "Complete visit",
};

function normalize(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function withNeutral(values: Partial<ReserveVocabulary>): ReserveVocabulary {
  return { ...neutral, ...values };
}

function vocabularyForToken(token: string): Partial<ReserveVocabulary> | null {
  if (!token) return null;

  if (
    [
      "restaurant",
      "restaurants",
      "dining",
      "diner",
      "cafe",
      "coffee",
      "table",
      "bar_seat",
    ].includes(token)
  ) {
    return {
      resource: "Table",
      resourcePlural: "Tables",
      assignResource: "Assign table",
      chooseResource: "Choose a table",
      readyAction: "Table ready",
      seatAction: "Seat guest",
      seatedStatus: "Seated",
      floorTitle: "Floor status",
      floorView: "Manage layout",
      partyLabel: "Party",
      partySizeLabel: "Party size",
    };
  }

  if (
    [
      "hookah",
      "hookah_lounge",
      "lounge",
      "lounges",
      "bar",
      "bars",
      "nightlife",
      "club",
      "clubs",
      "section",
      "booth",
    ].includes(token)
  ) {
    return {
      resource: "Section",
      resourcePlural: "Sections",
      assignResource: "Assign section",
      chooseResource: "Choose a section",
      readyAction: "Section ready",
      seatAction: "Seat guest",
      seatedStatus: "Seated",
      floorTitle: "Section status",
      floorView: "Manage layout",
      partyLabel: "Party",
      partySizeLabel: "Party size",
    };
  }

  if (["bowling", "bowling_alley", "lane", "lanes"].includes(token)) {
    return {
      resource: "Lane",
      resourcePlural: "Lanes",
      assignResource: "Assign lane",
      chooseResource: "Choose a lane",
      readyAction: "Lane ready",
      seatAction: "Start lane",
      seatedStatus: "In lane",
      floorTitle: "Lane status",
      floorView: "Manage lanes",
      partyLabel: "Group",
      partySizeLabel: "Group size",
    };
  }

  if (["karaoke", "karaoke_room"].includes(token)) {
    return {
      resource: "Room",
      resourcePlural: "Rooms",
      assignResource: "Assign room",
      chooseResource: "Choose a room",
      readyAction: "Room ready",
      seatAction: "Start room",
      seatedStatus: "In room",
      floorTitle: "Room status",
      floorView: "Manage rooms",
      partyLabel: "Group",
      partySizeLabel: "Group size",
    };
  }

  if (["escape_room", "escape", "activity", "activities", "experience"].includes(token)) {
    return {
      resource: "Room",
      resourcePlural: "Rooms",
      assignResource: "Assign room",
      chooseResource: "Choose a room",
      readyAction: "Room ready",
      seatAction: "Start experience",
      seatedStatus: "In progress",
      floorTitle: "Space status",
      floorView: "Manage spaces",
      partyLabel: "Group",
      partySizeLabel: "Group size",
    };
  }

  if (["spa", "salon", "wellness", "service"].includes(token)) {
    return {
      resource: "Room",
      resourcePlural: "Rooms",
      assignResource: "Assign room",
      chooseResource: "Choose a room",
      readyAction: "Room ready",
      seatAction: "Start service",
      seatedStatus: "In service",
      floorTitle: "Room status",
      floorView: "Manage rooms",
      partyLabel: "Guest",
      partySizeLabel: "Group size",
    };
  }

  if (["venue", "venues", "event", "events", "space", "spaces"].includes(token)) {
    return {
      resource: "Space",
      resourcePlural: "Spaces",
      assignResource: "Assign space",
      chooseResource: "Choose a space",
      readyAction: "Space ready",
      seatAction: "Start booking",
      seatedStatus: "In progress",
      floorTitle: "Space status",
      floorView: "Manage spaces",
      partyLabel: "Group",
      partySizeLabel: "Group size",
    };
  }

  if (["room", "rooms"].includes(token)) {
    return {
      resource: "Room",
      resourcePlural: "Rooms",
      assignResource: "Assign room",
      chooseResource: "Choose a room",
      readyAction: "Room ready",
      seatAction: "Start room",
      seatedStatus: "In room",
      floorTitle: "Room status",
      floorView: "Manage rooms",
      partyLabel: "Group",
      partySizeLabel: "Group size",
    };
  }

  return null;
}

export function getReserveVocabulary(
  locationType?: string | null,
  itemType?: string | null,
): ReserveVocabulary {
  const byLocation = vocabularyForToken(normalize(locationType));
  if (byLocation) return withNeutral(byLocation);
  const byItem = vocabularyForToken(normalize(itemType));
  return withNeutral(byItem || {});
}

export function getReserveStatusLabel(
  status?: string | null,
  vocab: ReserveVocabulary = neutral,
) {
  if (String(status || "").toLowerCase() === "seated") return vocab.seatedStatus;
  if (["checked_in", "arrived"].includes(String(status || "").toLowerCase())) {
    return vocab.arrivalStatus;
  }
  return null;
}
