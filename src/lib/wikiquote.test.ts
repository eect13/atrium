import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WQ_UA,
  acceptQuote,
  authorFromCite,
  cleanWikitext,
  disambigLinks,
  isDisambiguation,
  loadWikiquote,
  parseQotd,
  parseQuotePage,
  qotdTitle,
  searchTitles,
  wqPageHref,
  type WqGet,
} from "./wikiquote.ts";

const AUTHOR_PAGE = `[[File:Bust.jpg|thumb|right|[[Time]] discovers [[truth]].]]
'''[[w:Seneca the Younger|Lucius Annaeus Seneca]]''' (c. 4 BC – AD 65) was a Stoic.

== Quotes ==
*To be angry with a man is to hate him; to hate him is to wish him harm.<ref>De Ira</ref>
**Seneca, On Anger (De Ira) 2.34.5
* ''Quaeris Alcidae parem? Nemo est nisi ipse.
** Do you seek Alcides' equal? None is, except himself.
*** line 84
* ''[[w:Luck|Luck]]'' is what happens when '''preparation''' meets {{w|opportunity}}.
** Attributed in many places
* Short.
* See [https://example.com this page] for more | table
== Disputed ==
* Disputed lines never reach a card even when they are long.
** Someone
== Quotes about Seneca ==
* Seneca was a great writer of Stoic letters and plays.
** [[Montaigne]]
`;

const THEME_PAGE = `[[File:Owl.jpg|thumb|Wisdom requires the long view. ~ [[John F. Kennedy]] ]]
== A ==
* To flee vice is the beginning of virtue, and to have got rid of folly is the beginning of wisdom.
** [[Horace]], ''Epistles'', I, i, 41.
* Knowing yourself is the beginning of all wisdom.
** [[Aristotle|Aristotle (attributed)]]
* Tell (for you can) what is it to be wise?<br>'Tis but to know how little can be known.
** [[Alexander Pope]], ''An Essay on Man''
* Wisdom is the daughter of experience.
** Leonardo da Vinci, Notebooks
* A line cited by a very long sentence that is not a name at all.
** Said by the orcish warchief Thrall in a novel
== See also ==
* [[Knowledge]] is a related theme with plenty of lines.
`;

const QOTD = `{{Wikiquote:Quote of the day/Template
| image1 = Hills.jpg
| quote = <!-- ⨀ <br /> -->''There rolls the deep where grew the [[tree]].<br/>O [[earth]], what [[changes]] hast thou seen!''
| author = Alfred, Lord Tennyson<!-- [[Alfred, Lord Tennyson]] -->
}}`;

test("cleanWikitext strips links, templates, refs, markup and entities", () => {
  assert.equal(cleanWikitext("''[[w:Luck|Luck]]'' is '''here'''{{cn}}<ref>r</ref> &amp; now {{w|Page|label}}"), "Luck is here & now label");
  assert.equal(cleanWikitext("One<br>Two<br />"), "One / Two");
  assert.equal(cleanWikitext("[[File:x.jpg|thumb|cap]]Text [https://a.b label]"), "Text label");
});

test("acceptQuote filters length, leftover markup and labels", () => {
  assert.equal(acceptQuote("Short."), false);
  assert.equal(acceptQuote("A".repeat(10) + " real words here"), true);
  assert.equal(acceptQuote("x".repeat(301)), false);
  assert.equal(acceptQuote("Contains a | pipe from a table row"), false);
  assert.equal(acceptQuote("Ends like a heading label:"), false);
});

test("author page: page title is the author; translation replaces an italic original; skips Disputed and About", () => {
  const q = parseQuotePage(AUTHOR_PAGE, "Seneca the Younger");
  assert.deepEqual(
    q.map((x) => x.text),
    [
      "To be angry with a man is to hate him; to hate him is to wish him harm.",
      "Do you seek Alcides' equal? None is, except himself.",
      "Luck is what happens when preparation meets opportunity.",
    ],
  );
  assert.ok(q.every((x) => x.author === "Seneca the Younger" && x.source === "wikiquote"));
  assert.equal(q[0]?.href, "https://en.wikiquote.org/wiki/Seneca_the_Younger");
});

test("theme page: author comes from each citation; See also skipped; non-name cites dropped", () => {
  const q = parseQuotePage(THEME_PAGE, "Wisdom");
  assert.deepEqual(
    q.map((x) => x.author),
    ["Horace", "Aristotle (attributed)", "Alexander Pope", "Leonardo da Vinci"],
  );
  assert.match(q[2]!.text, /wise\? \/ 'Tis but/);
  assert.ok(q.every((x) => x.href === "https://en.wikiquote.org/wiki/Wisdom"));
});

test("authorFromCite reads the first link or a short leading name", () => {
  assert.equal(authorFromCite("[[Paul of Tarsus]], ''Romans'' 11:33"), "Paul of Tarsus");
  assert.equal(authorFromCite("Leonardo da Vinci, Notebooks"), "Leonardo da Vinci");
  assert.equal(authorFromCite("Letter of 1905 to a friend in Bern"), "");
});

test("Quote of the day: template params → one quote, verse joined with slashes", () => {
  const q = parseQotd(QOTD, "Wikiquote:Quote of the day/October 6, 2026");
  assert.equal(q.length, 1);
  assert.equal(q[0]?.author, "Alfred, Lord Tennyson");
  assert.equal(q[0]?.text, "There rolls the deep where grew the tree. / O earth, what changes hast thou seen!");
  assert.equal(q[0]?.href, "https://en.wikiquote.org/wiki/Wikiquote:Quote_of_the_day/October_6,_2026");
  assert.equal(qotdTitle("2026-10-06"), "Wikiquote:Quote of the day/October 6, 2026");
  assert.equal(qotdTitle("2026-13-01"), null);
});

test("opensearch ranks an exact title first; disambiguation links read in order", () => {
  const raw = JSON.stringify(["seneca", ["Seneca the Younger", "Seneca", "Seneca the Elder"], [], []]);
  assert.deepEqual(searchTitles(raw, "Seneca"), ["Seneca", "Seneca the Younger", "Seneca the Elder"]);
  assert.deepEqual(searchTitles("not json", "x"), []);
  const dab = "'''Seneca''' can refer to:\n* [[Seneca the Elder]] - orator\n* [[Seneca the Younger]] - philosopher\n{{disambig}}";
  assert.equal(isDisambiguation(dab), true);
  assert.deepEqual(disambigLinks(dab), ["Seneca the Elder", "Seneca the Younger"]);
  assert.equal(wqPageHref("Courage (film)"), "https://en.wikiquote.org/wiki/Courage_(film)");
});

/** Mocked fetch: records calls, answers by URL. */
function mockGet(routes: Record<string, string | null>) {
  const calls: { url: string; ua: string }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const get: WqGet = async (url, headers) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({ url, ua: headers["User-Agent"] ?? "" });
    await new Promise((r) => setTimeout(r, 2));
    inFlight -= 1;
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? routes[key]! : null;
  };
  return { get, calls, maxInFlight: () => maxInFlight };
}

const parseJson = (title: string, wikitext: string) => JSON.stringify({ parse: { title, wikitext } });

test("loadWikiquote daily/topic: one parse call with the honest User-Agent", async () => {
  const m = mockGet({
    "page=Wikiquote%3AQuote%20of%20the%20day%2FOctober%206%2C%202026": parseJson("Wikiquote:Quote of the day/October 6, 2026", QOTD),
    "page=Wisdom": parseJson("Wisdom", THEME_PAGE),
  });
  const daily = await loadWikiquote("daily", "2026-10-06", m.get);
  assert.equal(daily.quotes.length, 1);
  const topic = await loadWikiquote("topic", "wisdom", m.get);
  assert.equal(topic.quotes.length, 4);
  assert.equal(topic.title, "Wisdom");
  assert.ok(m.calls.every((c) => c.ua === WQ_UA && /AtriumDesk/.test(c.ua)));
  assert.ok(m.calls.every((c) => c.url.startsWith("https://en.wikiquote.org/w/api.php?action=parse&format=json")));
});

test("loadWikiquote author: opensearch → disambiguation → the ranked person page, serially", async () => {
  const dab = "'''Seneca''' can refer to:\n* [[Seneca the Elder]]\n* [[Seneca the Younger]]\n{{disambig}}";
  const m = mockGet({
    "action=opensearch": JSON.stringify(["seneca", ["Seneca", "Seneca the Younger", "Seneca the Elder"], [], []]),
    "page=Seneca%20the%20Younger": parseJson("Seneca the Younger", AUTHOR_PAGE),
    "page=Seneca": parseJson("Seneca", dab),
  });
  const r = await loadWikiquote("author", "Seneca", m.get);
  assert.equal(r.title, "Seneca the Younger");
  assert.equal(r.quotes.length, 3);
  assert.equal(m.calls.length, 3);
  assert.equal(m.maxInFlight(), 1);
});

test("loadWikiquote never throws: network failure, bad JSON, unknown topic → empty", async () => {
  const boom: WqGet = async () => {
    throw new Error("offline");
  };
  assert.deepEqual(await loadWikiquote("daily", "2026-10-06", boom), { quotes: [] });
  assert.deepEqual(await loadWikiquote("topic", "wisdom", mockGet({ "page=Wisdom": "<html>429</html>" }).get), { quotes: [] });
  assert.deepEqual(await loadWikiquote("topic", "nope", mockGet({}).get), { quotes: [] });
  assert.deepEqual(await loadWikiquote("author", "zzzz", mockGet({ opensearch: JSON.stringify(["zzzz", [], [], []]) }).get), { quotes: [] });
});
