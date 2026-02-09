import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./App.css";
import MusuNuotrauka from "./assets/musu-nuotrauka.jpg";

const WEDDING = {
  groom: "Deividas",
  bride: "Aistė",
  dateISO: "2026-06-25T14:00:00+03:00", // ceremonijos pradžia (LT vasaros laikas, EEST)
  churchName: "Kulautuvos bažnyčia",
  churchMapsQuery: "Kulautuvos bažnyčia",
  partyPlace: "Vieta dar tikslinama",
};

const DEFAULT_PROD_API_BASE_URL = "https://vestuviubackend-production.up.railway.app";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLTDate(date) {
  // paprastas LT formatas: 2026-06-25
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function apiUrl(path) {
  const raw = String(path || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;

  const envBase = String(process.env.REACT_APP_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const base =
    envBase || (process.env.NODE_ENV === "production" ? DEFAULT_PROD_API_BASE_URL : "");
  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${p}`;
}

function normalizeRsvpEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  // If someone accidentally sets a host-like value without scheme
  // (e.g. "vestuviubackend-production.up.railway.app/api/rsvp"), treat it as invalid
  // to avoid generating "https://<front>/<host>/api/...".
  const looksLikeHostPath = /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw);
  if (looksLikeHostPath) return null;

  return `/${raw}`;
}

function parseEnvBool(value) {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

class ApiError extends Error {
  constructor(message, { status, body, contentType } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.contentType = contentType;
  }
}

async function postJSON(url, payload, { signal } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && (body.error || body.message)) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;
    throw new ApiError(String(message), {
      status: res.status,
      body,
      contentType,
    });
  }

  return body;
}

function useCountdown(targetISO) {
  const target = useMemo(() => new Date(targetISO).getTime(), [targetISO]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, target - now);
  const totalSeconds = Math.floor(diff / 1000);

  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, done: diff === 0 };
}

function ProgressDots({ total, index, onJump, disabled = false }) {
  return (
    <div className="dots" role="tablist" aria-label="Žingsniai">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          className={`dot ${i === index ? "active" : ""}`}
          onClick={() => onJump(i)}
          disabled={disabled}
          aria-label={`Eiti į žingsnį ${i + 1}`}
          aria-selected={i === index}
          role="tab"
        />
      ))}
    </div>
  );
}

export default function App() {
  const steps = useMemo(
    () => [
      { id: "welcome", title: "Pakvietimas" },
      { id: "details", title: "Detalės" },
      { id: "rsvp", title: "RSVP" },
      { id: "dresscode", title: "Aprangos kodas" },
      { id: "end", title: "Pabaiga" },
    ],
    []
  );

  const [opened, setOpened] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [rsvpSubmit, setRsvpSubmit] = useState({ status: "idle", message: "" });
  const rsvpSubmitAbortRef = useRef(null);

  const [rsvp, setRsvp] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("wedding_rsvp") || "null") || {
          name: "",
          attending: "taip",
          guests: 1,
          diet: "",
          note: "",
        }
      );
    } catch {
      return { name: "", attending: "taip", guests: 1, diet: "", note: "" };
    }
  });

  useEffect(() => {
    localStorage.setItem("wedding_rsvp", JSON.stringify(rsvp));
  }, [rsvp]);

  useEffect(() => {
    if (rsvpSubmit.status === "success" || rsvpSubmit.status === "error") {
      setRsvpSubmit({ status: "idle", message: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsvp.name, rsvp.attending, rsvp.guests, rsvp.diet, rsvp.note]);

  const go = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const next = () => go(Math.min(steps.length - 1, step + 1));
  const prev = () => go(Math.max(0, step - 1));

  const openInvite = () => {
    setOpened(true);
    setDirection(1);
    setStep(0);
  };

  const countdown = useCountdown(WEDDING.dateISO);

  const ceremonyDate = new Date(WEDDING.dateISO);

  useEffect(() => {
    const currentStepId = steps[step]?.id;
    if (currentStepId !== "rsvp" && rsvpSubmitAbortRef.current) {
      rsvpSubmitAbortRef.current.abort();
      rsvpSubmitAbortRef.current = null;
      setRsvpSubmit({ status: "idle", message: "" });
    }
  }, [step, steps]);

  const submitRsvp = async () => {
    const name = String(rsvp.name || "").trim();
    const guests = Number(rsvp.guests);
    const attending = String(rsvp.attending || "").trim();

    if (!name) {
      setRsvpSubmit({ status: "error", message: "Įrašykite vardą ir pavardę." });
      return false;
    }

    if (!Number.isFinite(guests) || guests < 1 || guests > 6) {
      setRsvpSubmit({ status: "error", message: "Neteisingas žmonių skaičius (1–6)." });
      return false;
    }

    if (!attending) {
      setRsvpSubmit({ status: "error", message: "Pasirinkite ar dalyvausite." });
      return false;
    }

    const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();
    const postEnabledEnv = parseEnvBool(process.env.REACT_APP_RSVP_POST_ENABLED);
    const postEnabled = postEnabledEnv ?? (!!apiBase || process.env.NODE_ENV === "production");
    if (!postEnabled) {
      setRsvpSubmit({
        status: "success",
        message: "Testavimo režimas: niekur nesiunčiame, duomenys išsaugoti šiame įrenginyje.",
      });
      return true;
    }

    if (rsvpSubmitAbortRef.current) {
      rsvpSubmitAbortRef.current.abort();
    }
    const controller = new AbortController();
    rsvpSubmitAbortRef.current = controller;

    setRsvpSubmit({ status: "submitting", message: "Siunčiame…" });

    try {
      const payload = {
        wedding: {
          groom: WEDDING.groom,
          bride: WEDDING.bride,
          dateISO: WEDDING.dateISO,
        },
        rsvp: {
          name,
          attending,
          guests,
          diet: String(rsvp.diet || "").trim(),
          note: String(rsvp.note || "").trim(),
        },
        submittedAtISO: new Date().toISOString(),
        source: "web",
      };

      const endpoint =
        normalizeRsvpEndpoint(process.env.REACT_APP_RSVP_ENDPOINT) || "/api/rsvp";
      const url = apiUrl(endpoint);
      await postJSON(url, payload, { signal: controller.signal });
      setRsvpSubmit({ status: "success", message: "Ačiū! Registracija išsiųsta." });
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return;

      const base = (process.env.REACT_APP_API_BASE_URL || "").trim();
      const isDev = process.env.NODE_ENV === "development";
      const isMissingLocalBackend =
        isDev &&
        !base &&
        e?.name === "ApiError" &&
        e?.status === 404 &&
        typeof e?.body === "string" &&
        e.body.includes("Cannot POST /api/rsvp");

      if (isMissingLocalBackend) {
        setRsvpSubmit({
          status: "success",
          message:
            "Backend dar neprijungtas (POST /api/rsvp). Registracija išsaugota šiame įrenginyje.",
        });
        return true;
      }

      const safeMessage =
        e?.name === "ApiError" && typeof e?.body === "string" && e.body.includes("<html")
          ? "Serverio klaida. Pabandykite dar kartą."
          : e?.message || "Nepavyko išsiųsti. Pabandykite dar kartą.";

      setRsvpSubmit({
        status: "error",
        message: safeMessage,
      });
      return false;
    } finally {
      if (rsvpSubmitAbortRef.current === controller) {
        rsvpSubmitAbortRef.current = null;
      }
    }
  };

  const submitRsvpAndGo = async (nextIndex) => {
    const ok = await submitRsvp();
    if (ok) go(nextIndex);
  };

  const onStepJump = (nextIndex) => {
    const currentStepId = steps[step]?.id;
    if (currentStepId === "rsvp" && nextIndex > step) {
      void submitRsvpAndGo(nextIndex);
      return;
    }
    go(nextIndex);
  };

  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(
    WEDDING.churchMapsQuery
  )}&output=embed`;

  return (
    <div className="App">
      <main
        className={`shell${opened ? "" : " shellIntro"}${
          opened && steps[step]?.id !== "rsvp" ? " shellCenterMobile" : ""
        }`}
      >
        <section className="card">
          {/* ✅ Kontentas dabar yra viduje “popieriaus” (cardInner),
              o gėlės lieka kaip rėmelis aplink. */}
          <div className="cardInner">
            <AnimatePresence mode="wait" initial={false}>
              {!opened ? (
                <motion.div
                  key="intro"
                  className="intro"
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <div className="bigNames">
                    {WEDDING.groom} <span>&</span> {WEDDING.bride}
                  </div>

                  <p className="lead">💜 Jums – mažas laiškas su meile 💜</p>

                  <div className="row introRow">
                    <button
                      type="button"
                      className="envelopeButton"
                      onClick={openInvite}
                      aria-label="Atidaryti kvietimą"
                      title="Atidaryti kvietimą"
                    >
                      <svg
                        className="envelopeIcon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          d="M20 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 2v.2l-8 5.2-8-5.2V8h16ZM4 16V10.3l7.46 4.85a1 1 0 0 0 1.08 0L20 10.3V16H4Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="invite"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <ProgressDots
                    total={steps.length}
                    index={step}
                    onJump={onStepJump}
                    disabled={rsvpSubmit.status === "submitting"}
                  />

                  <AnimatePresence initial={false} custom={direction} mode="popLayout">
                    <motion.div
                      key={steps[step].id}
                      className="step"
                      custom={direction}
                      initial={{ opacity: 0, x: direction * 40, filter: "blur(6px)" }}
                      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, x: -direction * 40, filter: "blur(6px)" }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    >
                      {steps[step].id === "welcome" && (
                        <div className="grid2">
                          <div>
                            <div className="heroLine">
                              <div className="bigNames">
                                {WEDDING.groom} <span>&</span> {WEDDING.bride}
                              </div>
                              <h1 className="title">Kviečiame švęsti mūsų meilę 💜</h1>
                              <div className="countdown">
                                <div className="cdItem">
                                  <div className="cdNum">{countdown.days}</div>
                                  <div className="cdLbl">dienos</div>
                                </div>
                                <div className="cdItem">
                                  <div className="cdNum">{countdown.hours}</div>
                                  <div className="cdLbl">val.</div>
                                </div>
                                <div className="cdItem">
                                  <div className="cdNum">{countdown.minutes}</div>
                                  <div className="cdLbl">min.</div>
                                </div>
                                <div className="cdItem">
                                  <div className="cdNum">{countdown.seconds}</div>
                                  <div className="cdLbl">sek.</div>
                                </div>
                              </div>
                              <div className="metaBox">
                                <div className="sub">{formatLTDate(ceremonyDate)}</div>
                                <div className="sub">{WEDDING.churchName}</div>
                              </div>
                            </div>

                            <p className="welcomeLead">
                              Labai norime, kad būtumėte kartu su mumis šią ypatingą dieną. Toliau
                              rasite detales ir trumpą registraciją.
                            </p>

                            <div className="row rowSingle">
                              <button className="pill" onClick={next}>
                                Tęsti →
                              </button>
                            </div>
                          </div>

                          <div className="hero">
                            <img src={MusuNuotrauka} alt="Mūsų nuotrauka" />
                          </div>
                        </div>
                      )}

                      {steps[step].id === "details" && (
                        <div className="detailsStep">
                          <h2 className="title">Detalės</h2>

                          <div className="infoGrid">
                            <div className="infoCard">
                              <div className="infoTitle">Ceremonija</div>
                              <div className="infoBig">{WEDDING.churchName}</div>
                              <div className="infoText">
                                Data: <b>{formatLTDate(ceremonyDate)}</b>
                                <br />
                                Laikas:{" "}
                                <b>
                                  {pad2(ceremonyDate.getHours())}:{pad2(ceremonyDate.getMinutes())}
                                </b>{" "}
                                <span className="muted">(jei reikės – pakeisim)</span>
                              </div>
                            </div>

                            <div className="infoCard">
                              <div className="infoTitle">Vakarėlis</div>
                              <div className="infoBig">{WEDDING.partyPlace}</div>
                              <div className="infoText">
                                Vakarėlio vietą atnaujinsime čia, kai tik patvirtinsime.
                              </div>
                            </div>

                            <div className="infoCard">
                              <div className="infoTitle">Žemėlapis</div>
                              <div className="map">
                                <iframe
                                  title="Kulautuvos bažnyčia žemėlapyje"
                                  src={mapsEmbed}
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="row">
                            <button className="pill ghost" onClick={prev}>
                              ← Atgal
                            </button>
                            <button className="pill" onClick={() => go(2)}>
                              Registracija →
                            </button>
                          </div>
                        </div>
                      )}

                      {steps[step].id === "rsvp" && (
                        <div className="rsvpStep">
                          <h2 className="title">Registracija</h2>
                          <div className="formGrid">
                            <label className="field">
                              <span>Vardas, pavardė</span>
                              <input
                                value={rsvp.name}
                                onChange={(e) =>
                                  setRsvp((s) => ({ ...s, name: e.target.value }))
                                }
                                placeholder="Pvz.: Jonas Jonaitis"
                              />
                            </label>

                            <label className="field">
                              <span>Ar dalyvausite?</span>
                              <select
                                value={rsvp.attending}
                                onChange={(e) =>
                                  setRsvp((s) => ({ ...s, attending: e.target.value }))
                                }
                              >
                                <option value="taip">Taip, su malonumu 💜</option>
                                <option value="gal">Dar nežinau 🤍</option>
                                <option value="ne">Deja, negalėsiu 🤍</option>
                              </select>
                            </label>

                            <label className="field">
                              <span>Kiek žmonių (su jumis)</span>
                              <input
                                type="number"
                                min={1}
                                max={6}
                                value={rsvp.guests}
                                onChange={(e) =>
                                  setRsvp((s) => ({
                                    ...s,
                                    guests: Number(e.target.value || 1),
                                  }))
                                }
                              />
                            </label>

                            <label className="field">
                              <span>Mitybos pastabos (jei yra)</span>
                              <input
                                value={rsvp.diet}
                                onChange={(e) =>
                                  setRsvp((s) => ({ ...s, diet: e.target.value }))
                                }
                                placeholder="Vegetariška, alergijos ir pan."
                              />
                            </label>

                            <label className="field span2">
                              <span>Žinutė jaunavedžiams</span>
                              <textarea
                                rows={4}
                                value={rsvp.note}
                                onChange={(e) =>
                                  setRsvp((s) => ({ ...s, note: e.target.value }))
                                }
                                placeholder="Komentaras..."
                              />
                            </label>
                          </div>

                          <div className="row">
                            <button
                              className="pill ghost"
                              onClick={prev}
                              disabled={rsvpSubmit.status === "submitting"}
                            >
                              ← Atgal
                            </button>

                            <button
                              className="pill"
                              type="button"
                              onClick={() => submitRsvpAndGo(step + 1)}
                              disabled={rsvpSubmit.status === "submitting"}
                            >
                              Pateikti ir tęsti →
                            </button>
                          </div>

                          {rsvpSubmit.status !== "idle" && (
                            <div
                              className={
                                rsvpSubmit.status === "error"
                                  ? "submitNote submitError"
                                  : rsvpSubmit.status === "success"
                                    ? "submitNote submitSuccess"
                                    : "submitNote"
                              }
                              role={rsvpSubmit.status === "error" ? "alert" : "status"}
                            >
                              {rsvpSubmit.message}
                            </div>
                          )}
                        </div>
                      )}

                      {steps[step].id === "dresscode" && (
                        <div>
                          <h2 className="title">Aprangos kodas</h2>
                          <p className="muted">
                            Labai prašome rinktis švelnias, pastelinių tonų spalvas pagal šią
                            paletę.
                          </p>

                          <div className="palette">
                            <div className="swatch swatchSageDark" aria-label="Samanų žalia" />
                            <div className="swatch swatchSage" aria-label="Švelni sage" />
                            <div className="swatch swatchLavender" aria-label="Levandų" />
                            <div className="swatch swatchLilac" aria-label="Švelni alyvinė" />
                          </div>

                          <div className="row">
                            <button className="pill ghost" onClick={prev}>
                              ← Atgal
                            </button>
                            <button className="pill" onClick={next}>
                              Pabaiga →
                            </button>
                          </div>
                        </div>
                      )}

                      {steps[step].id === "end" && (
                        <div>
                          <h2 className="title endTitle" style={{ textAlign: "center" }}>
                            💜 Iki pasimatymo {WEDDING.groom} & {WEDDING.bride} 💜
                          </h2>
                          <div className="row">
                            <button className="pill ghost" onClick={prev}>
                              ← Atgal
                            </button>
                            <button className="pill" onClick={() => go(0)}>
                              Į pradžią ↑
                            </button>
                          </div>

                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
