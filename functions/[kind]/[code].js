// Cloudflare Pages Function: krótkie linki z podglądem na czacie, edunote.rozycki.pro/n/KOD (notatka), /p/KOD (przedmiot),
// /s/KOD (powtórka do słuchania). Oddaje zwykłą stronę n/, p/ albo s/ (ta sama co pod …/n/#KOD), tylko z tytułem
// i opisem tej jednej notatki w og:title / og:description, np. „Notatki: Statystyka, czwartek 13.11”.
// Nagłówek bierze z get_share_preview (bez licznika wyświetleń i bez podpisu autora). Gdy Supabase milczy,
// strona wychodzi z ogólnym podglądem, a notatka i tak się otworzy, bo resztę robi skrypt strony.
// Źródło: web-functions/ w repo aplikacji; scripts/publish-web.sh kopiuje je do functions/ w repo edunote-web.

const SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
// klucz publiczny (publishable), ten sam co w skryptach strony; nie jest sekretem
const KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
const DAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return DAYS[d.getUTCDay()] + " " + (+m[3]) + "." + m[2];
}

function short(text, max) {
  text = String(text || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Tytuł i opis podglądu; null = ogólny podgląd ze strony */
export function describe(kind, info) {
  if (!info || !info.subject) return null;
  const subject = short(info.subject, 60);
  if (kind === "n") {
    const when = day(info.lesson_date);
    return {
      title: "Notatki: " + subject + (when ? ", " + when : ""),
      text: (info.topic ? short(info.topic, 90) + ". " : "") + "Notatka z zajęć od kogoś z roku: streszczenie, fiszki i quiz. W przeglądarce, bez logowania.",
    };
  }
  if (kind === "p") {
    return {
      title: "Notatki z przedmiotu: " + subject,
      text: "Wszystkie notatki z zajęć od kogoś z roku, fiszki i quiz z całości. W przeglądarce, bez logowania.",
    };
  }
  const exam = info.exam_date ? day(info.exam_date) : "";
  return {
    title: "Powtórka do słuchania: " + subject,
    text: (info.exam_title ? short(info.exam_title, 60) + (exam ? ", " + exam : "") + ". " : "")
      + "Krótkie odcinki z całego zakresu i fiszki od kogoś z roku. W przeglądarce, bez logowania.",
  };
}

async function preview(kind, code) {
  const url = SUPABASE + "/rest/v1/rpc/get_share_preview?p_kind=" + kind + "&p_code=" + encodeURIComponent(code);
  try {
    const r = await fetch(url, {
      headers: { apikey: KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  }
}

export async function onRequest(ctx) {
  const kind = ctx.params.kind, code = ctx.params.code;
  if (!["n", "p", "s"].includes(kind) || typeof code !== "string" || !/^[A-Za-z0-9]{4,40}$/.test(code)) return ctx.next();
  const req = ctx.request;
  if (req.method !== "GET" && req.method !== "HEAD") return ctx.next();
  const url = new URL(req.url);
  const [page, info] = await Promise.all([
    ctx.env.ASSETS.fetch(new URL("/" + kind + "/", url)),
    preview(kind, code),
  ]);
  if (!page.ok) return page;
  const d = describe(kind, info);
  const site = url.origin;
  const canonical = site + "/" + kind + "/" + code;
  let out = new HTMLRewriter()
    .on('meta[property="og:image"]', { element(e) { e.setAttribute("content", site + "/og.png"); } })
    .on("head", { element(e) { e.append('<meta property="og:url" content="' + canonical + '">', { html: true }); } });
  if (d) {
    out = out
      .on("title", { element(e) { e.setInnerContent(d.title + " · EduNote"); } })
      .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", d.title); } })
      .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", d.text); } })
      .on('meta[name="description"]', { element(e) { e.setAttribute("content", d.text); } });
  }
  const res = out.transform(page);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.set("X-Robots-Tag", "noindex");
  return new Response(res.body, { status: 200, headers });
}
