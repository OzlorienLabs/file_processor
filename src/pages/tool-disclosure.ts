import { Cpu, HardDrive, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';

import type { ToolDefinition } from '../app/tool-catalog';

interface Disclosure {
  pill: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: 'true' }>;
  note: string;
}

/** The pill label, icon, and privacy sentence shown above every tool workspace. */
export function describeProcessing(tool: ToolDefinition): Disclosure {
  if (tool.processing === 'browser-and-provider') {
    return {
      pill: 'Browser + your AI provider',
      icon: Sparkles,
      note: 'The file is read locally. Only the content needed for this AI task is sent to the provider you select; FileKit does not save it.',
    };
  }
  if (tool.processing === 'browser-or-provider') {
    return {
      pill: 'On-device AI or your provider',
      icon: Cpu,
      note: "With Chrome's built-in model nothing leaves this device. If you choose a cloud provider, only your prompt is sent using your own key. History stays in this browser's local storage.",
    };
  }
  if (tool.storage === 'local') {
    return {
      pill: 'Runs in your browser',
      icon: HardDrive,
      note: "Everything runs on this device. Your work is saved in this browser's local storage so it is here when you return; nothing is uploaded, and the export and clear controls on this page manage it.",
    };
  }
  return {
    pill: 'Runs in your browser',
    icon: HardDrive,
    note: 'Your files stay on this device. Processing happens in browser memory and disappears when you close or refresh this page.',
  };
}
