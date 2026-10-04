'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Scene3D } from '@trace/rack-engine';
import type { View3D } from './warehouse3d';

/**
 * The whole warehouse in 3D, behind a button beside the plan's expand icon.
 *
 * View only: it shows the sheet's current floor, stood up from the same
 * geometry the plan draws, and it changes nothing. three.js is fetched when the
 * view is first opened and not before, so the sheet itself never carries it;
 * closing the view stops its drawing and gives back every GPU resource it took.
 */
export function ThreeDView({ title, makeScene }: {
  /** "3D VIEW — 240 × 120 FT · SELECTIVE" */
  title: string;
  /** The engine's scene for the floor on the sheet, built when the view opens. */
  makeScene: () => Scene3D;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'nogl' | 'failed'>('loading');
  const [spin, setSpin] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View3D | null>(null);
  // read once per opening, so a redraw of the sheet does not rebuild the scene
  const sceneRef = useRef(makeScene);
  sceneRef.current = makeScene;

  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return undefined;
    let gone = false;
    setState('loading');
    setSpin(false);
    import('./warehouse3d').then((mod) => {
      if (gone) return;
      const view = mod.mountWarehouse(el, sceneRef.current(), setSpin);
      if (!view) { setState('nogl'); return; }
      viewRef.current = view;
      setState('ready');
    }).catch(() => { if (!gone) setState('failed'); });
    return () => {
      gone = true;
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [open]);

  const toggleSpin = () => {
    const on = !spin;
    setSpin(on);
    viewRef.current?.setAutoRotate(on);
  };

  return (
    <>
      <button type="button" className="fig3dbtn" aria-label={`Open ${title.toLowerCase()}`}
        aria-expanded={open} onClick={(e) => {
          // Into the sheet's root, as the expanded plan is, so it stacks above
          // the masthead rather than inside the figure's corner.
          setHost(e.currentTarget.closest<HTMLElement>('.a3') ?? document.body);
          setOpen(true);
        }}>3D</button>
      {open && host && createPortal(
        <div className="w3d" role="dialog" aria-modal="true" aria-label={title}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w3dbox">
            <div className="w3dbar">
              <span className="w3dtitle">{title}</span>
              <span className="w3dsp" />
              <button type="button" className="w3dbtn" disabled={state !== 'ready'}
                onClick={() => viewRef.current?.reset()}>Reset view</button>
              <button type="button" className="w3dbtn" disabled={state !== 'ready'}
                onClick={() => viewRef.current?.top()}>Top</button>
              <button type="button" className="w3dbtn" aria-pressed={spin} disabled={state !== 'ready'}
                onClick={toggleSpin}>Auto-rotate</button>
              <button type="button" className="w3dx" aria-label="Close" onClick={() => setOpen(false)}>&#215;</button>
            </div>
            <div className="w3dstage">
              <div className="w3dcanvas" ref={stageRef} />
              {state === 'loading' && <div className="w3dmsg">Loading the 3D view…</div>}
              {state === 'nogl' && (
                <div className="w3dmsg">This browser can&#39;t show 3D — WebGL is turned off or not available.</div>
              )}
              {state === 'failed' && <div className="w3dmsg">The 3D view didn&#39;t load. Close it and try again.</div>}
              <div className="w3dnote">Preliminary visual — not for installation</div>
              <div className="w3dhint">Drag to orbit · scroll to zoom · right-drag to pan</div>
            </div>
          </div>
        </div>,
        host,
      )}
    </>
  );
}
