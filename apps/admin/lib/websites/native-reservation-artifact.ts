import "server-only";

type ArtifactFile = {
  path: string;
  content: string;
  encoding?: "utf8";
  contentType?: string;
};

const IFRAME_PATTERN = /<div class="reservation-frame-shell"><iframe class="reservation-frame" src="https:\/\/www\.theouthaven\.com\/embed\/reservations\/[^\"]+" title="[^"]*" loading="eager"><\/iframe><\/div>/g;

function nativeWidgetMarkup(locationId: string) {
  const safeLocationId = encodeURIComponent(locationId);
  return `<div class="reservation-frame-shell reservation-native-shell"><div data-theouthaven-reservations data-group-mounted="1" data-location-id="${safeLocationId}" data-api-base="https://www.theouthaven.com"></div></div>`;
}

function widgetScripts() {
  return `<script src="https://www.theouthaven.com/widgets/reservations.js" defer></script><script src="https://www.theouthaven.com/widgets/group-booking.js" defer></script>`;
}

export function upgradeGeneratedReservationArtifact<T extends ArtifactFile>(
  files: T[],
  locationId: string,
): T[] {
  return files.map((file) => {
    if (file.path !== "index.html" || !file.content) return file;
    if (!file.content.includes("reservation-frame")) return file;

    let content = file.content.replace(IFRAME_PATTERN, nativeWidgetMarkup(locationId));
    if (content.includes("data-theouthaven-reservations")) {
      content = content.replace(/<script src="https:\/\/www\.theouthaven\.com\/widgets\/reservations\.js" defer><\/script>/g, "");
      content = content.replace(/<script src="https:\/\/www\.theouthaven\.com\/widgets\/group-booking\.js" defer><\/script>/g, "");
      content = content.replace(/<script>\(function\(\)\{function enhance[\s\S]*?\}\)\(\);<\/script>/g, "");
      content = content.replace("</body>", `${widgetScripts()}</body>`);
    }
    content = content.replace(/\.reservation-frame\{[^}]*\}/g, "");
    content = content.replace(/\.reservation-frame-shell\{([^}]*)\}/g, ".reservation-frame-shell{$1}.reservation-native-shell{min-height:0;overflow:visible}.reservation-native-shell>[data-theouthaven-reservations]{width:100%}");
    return { ...file, content, encoding: "utf8" } as T;
  });
}
