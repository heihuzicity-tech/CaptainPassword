import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MouseEvent } from 'react';

const interactiveSelector = [
  'a',
  'button',
  'input',
  'label',
  'select',
  'summary',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const startWindowDrag = (event: MouseEvent<HTMLElement>) => {
  if (event.button !== 0 || !isTauri()) return;
  if ((event.target as HTMLElement).closest(interactiveSelector)) return;
  event.preventDefault();
  void getCurrentWindow().startDragging().catch((err) => {
    console.warn('Unable to start window drag', err);
  });
};
