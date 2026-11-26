'use client';

// Panel Demo (spec 5.8). Tahap 3: Gaji masuk, Belanja acak, Skenario boros, dan Reset data demo.
export default function DemoPanel({ disabled, onGaji, onBelanja, onBoros, onReset }) {
  return (
    <details className="demo-panel">
      <summary>Panel Demo</summary>
      <p className="demo-note">Simulasi untuk demo. Semua kejadian lewat jalur yang sama dengan kejadian sungguhan.</p>
      <div className="demo-actions">
        <button type="button" className="btn ghost" disabled={disabled} onClick={onGaji}>Gaji masuk</button>
        <button type="button" className="btn ghost" disabled={disabled} onClick={onBelanja}>Belanja acak</button>
        <button type="button" className="btn ghost" disabled={disabled} onClick={onBoros}>Skenario boros</button>
        <button type="button" className="btn ghost danger" disabled={disabled} onClick={onReset}>Reset data demo</button>
      </div>
    </details>
  );
}
