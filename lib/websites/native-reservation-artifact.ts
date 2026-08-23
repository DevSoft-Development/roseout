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
  return `<div class="reservation-frame-shell reservation-native-shell"><div data-theouthaven-reservations data-location-id="${safeLocationId}" data-api-base="https://www.theouthaven.com"></div></div>`;
}

function widgetScript() {
  return `<script src="https://www.theouthaven.com/widgets/reservations.js" defer></script>`;
}

function expandableGroupBookingScript() {
  return `<script>(function(){function enhance(root){if(!root||root.dataset.tohGroupEnhanced==='1')return;var frame=root.querySelector('iframe[title="Group booking"]');if(!frame)return;root.dataset.tohGroupEnhanced='1';frame.style.display='none';frame.style.minHeight='760px';var button=document.createElement('button');button.type='button';button.textContent='Open Group Booking';button.setAttribute('aria-expanded','false');button.style.cssText='margin-top:14px;min-height:48px;border:0;border-radius:999px;padding:0 18px;font:inherit;font-weight:900;cursor:pointer;background:var(--accent,#111);color:var(--accentText,#fff);width:100%';button.addEventListener('click',function(){var open=frame.style.display!=='none';frame.style.display=open?'none':'block';button.textContent=open?'Open Group Booking':'Close Group Booking';button.setAttribute('aria-expanded',open?'false':'true');});frame.parentNode.insertBefore(button,frame);var description=root.querySelector('.toh-contact-help');if(description)description.textContent='For larger parties, open the group booking form to check live availability and send the venue your request.';}function scan(){document.querySelectorAll('[data-theouthaven-reservations] .toh-card').forEach(enhance);}var observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();})();</script>`;
}

export function upgradeGeneratedReservationArtifact<T extends ArtifactFile>(
  files: T[],
  locationId: string,
): T[] {
  return files.map((file) => {
    if (file.path !== "index.html" || !file.content) return file;
    if (!file.content.includes("reservation-frame")) return file;

    let content = file.content.replace(IFRAME_PATTERN, nativeWidgetMarkup(locationId));
    if (content.includes("data-theouthaven-reservations") && !content.includes("/widgets/reservations.js")) {
      content = content.replace("</body>", `${widgetScript()}${expandableGroupBookingScript()}</body>`);
    } else if (content.includes("data-theouthaven-reservations") && !content.includes("tohGroupEnhanced")) {
      content = content.replace("</body>", `${expandableGroupBookingScript()}</body>`);
    }
    content = content.replace(/\.reservation-frame\{[^}]*\}/g, "");
    content = content.replace(/\.reservation-frame-shell\{([^}]*)\}/g, ".reservation-frame-shell{$1}.reservation-native-shell{min-height:0;overflow:visible}.reservation-native-shell>[data-theouthaven-reservations]{width:100%}");
    return { ...file, content, encoding: "utf8" } as T;
  });
}
