'use client';

// Panel Demo (spec 5.8). Tahap 2: Gaji masuk dan Reset data demo. Tombol lain menyusul di Tahap 3 dan 4.
export default function DemoPanel({ disabled, onGaji, onReset }) {
  return (
    <details className="demo-panel">
      <summary>Panel Demo</summary>
      <p className="demo-note">Simulasi untuk demo. Semua kejadian lewat jalur yang sama dengan kejadian sungguhan.</p>
      <div className="demo-actions">
        <button type="button" className="btn ghost" disabled={disabled} onClick={onGaji}>Gaji masuk</button>
        <button type="button" className="btn ghost danger" disabled={disabled} onClick={onReset}>Reset data demo</button>
      </div>
    </details>
  );
}
