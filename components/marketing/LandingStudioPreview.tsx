"use client";

import { useEffect, useMemo, useState } from "react";

const starterRows = [
  [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
  [false, false, false, false, false, false, true, false, false, false, false, false, false, false, true, false],
];

const rowNames = ["KICK", "CLAP", "HAT", "OPEN"];

export default function LandingStudioPreview() {
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState(starterRows);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % 16);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing]);

  const activeCount = useMemo(
    () => rows.reduce((total, row) => total + row.filter(Boolean).length, 0),
    [rows],
  );

  function toggleCell(rowIndex: number, stepIndex: number) {
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? row.map((active, index2) => (index2 === stepIndex ? !active : active))
          : row,
      ),
    );
  }

  return (
    <div className="landingStudio" aria-label="Interactive collaborative sequencer preview">
      <div className="landingStudioTopbar">
        <div className="studioWindowDots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="previewProjectMeta">
          <span>HOUSE_001</span>
          <span>128 BPM</span>
          <span>8 BARS</span>
        </div>
        <div className="previewPeople" aria-label="Three collaborators online">
          <span>A</span>
          <span>M</span>
          <span>K</span>
          <b>3 LIVE</b>
        </div>
      </div>

      <div className="landingTransport">
        <button onClick={() => setPlaying((current) => !current)}>
          {playing ? "■ STOP" : "▶ PLAY"}
        </button>
        <div className="previewTime">
          <span>01</span>
          <i />
          <span>{String(step + 1).padStart(2, "0")}</span>
        </div>
        <div className="previewSignal">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <small>{activeCount} EVENTS</small>
      </div>

      <div className="landingSequencer">
        <div className="previewTrackList">
          {rowNames.map((name, rowIndex) => (
            <div className="previewTrackName" key={name}>
              <span className={`previewTrackDot dot${rowIndex}`} />
              <b>{name}</b>
              <em>{rowIndex === 2 ? "-8.4" : rowIndex === 1 ? "-6.2" : "-4.0"}</em>
            </div>
          ))}
        </div>

        <div className="previewGrid">
          {rows.map((row, rowIndex) =>
            row.map((active, stepIndex) => (
              <button
                key={`${rowIndex}-${stepIndex}`}
                className={`${active ? "active" : ""} ${step === stepIndex ? "playhead" : ""}`}
                onClick={() => toggleCell(rowIndex, stepIndex)}
                aria-label={`${rowNames[rowIndex]} step ${stepIndex + 1}`}
              >
                <span />
              </button>
            )),
          )}
        </div>
      </div>

      <div className="previewArrangement">
        <div className="previewArrangeLabels">
          <span>SYNTH</span>
          <span>BASS</span>
          <span>SAMPLE</span>
        </div>
        <div className="previewArrangeBody">
          <div className="previewBarNumbers"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>
          <div className="previewClipLine"><i className="clipA">CHORDS / A</i><i className="clipB">CHORDS / B</i></div>
          <div className="previewClipLine"><i className="clipC">SUB BASS</i><i className="clipD">SUB BASS</i></div>
          <div className="previewClipLine"><i className="clipE">VOX_04.WAV</i></div>
        </div>
      </div>

      <div className="previewFoot">
        <span><i className="livePulse" /> LIVE SESSION</span>
        <span>12MS SYNC</span>
        <span>REV 042</span>
        <span className="previewHint">CLICK THE STEPS ↑</span>
      </div>
    </div>
  );
}
