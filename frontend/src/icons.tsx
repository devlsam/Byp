import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { config, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';

import {
  faPowerOff,
  faShieldHalved,
  faArrowUp,
  faArrowDown,
  faPlus,
  faTrashCan,
  faArrowsRotate,
  faFileCode,
  faGear,
  faMagnifyingGlass,
  faWifi,
  faServer,
  faGlobe,
  faXmark,
  faMinus,
  faBolt,
  faChevronRight,
  faDatabase,
  faCheck,
  faFolderOpen,
  faMicrochip,
  faLayerGroup,
  faCircleExclamation,
  faCircleInfo,
  faTriangleExclamation,
  faCircleQuestion,
  faTowerBroadcast,
  faGamepad,
  faRoute,
  faFilter,
  faWandMagicSparkles,
  faHeadphones,
  faDesktop,
  faSliders,
  faPenToSquare,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { faObjectUngroup } from '@fortawesome/free-regular-svg-icons';

// Ensure FontAwesome doesn't dynamically inject <style> tags into head at runtime
config.autoAddCss = false;

export interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'mask'> {
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
}

function createIcon(iconDef: IconDefinition, displayName: string) {
  const Component = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const { className, style, size, ...rest } = props;
    const customStyle: React.CSSProperties = { ...style };

    if (size) {
      const dimension = typeof size === 'number' ? `${size}px` : size;
      customStyle.width = dimension;
      customStyle.height = dimension;
    }

    return (
      <FontAwesomeIcon
        // @ts-ignore
        ref={ref}
        icon={iconDef}
        className={className}
        style={customStyle as any}
        {...rest}
      />
    );
  });

  Component.displayName = displayName;
  return Component;
}

// 100% Offline Local FontAwesome Icons
export const Power = createIcon(faPowerOff, 'Power');
export const Shield = createIcon(faShieldHalved, 'Shield');
export const ArrowUp = createIcon(faArrowUp, 'ArrowUp');
export const ArrowDown = createIcon(faArrowDown, 'ArrowDown');
export const Plus = createIcon(faPlus, 'Plus');
export const Trash2 = createIcon(faTrashCan, 'Trash2');
export const RefreshCw = createIcon(faArrowsRotate, 'RefreshCw');
export const FileCode = createIcon(faFileCode, 'FileCode');
export const Settings = createIcon(faGear, 'Settings');
export const SettingsIcon = createIcon(faGear, 'SettingsIcon');
export const Search = createIcon(faMagnifyingGlass, 'Search');
export const Wifi = createIcon(faWifi, 'Wifi');
export const Server = createIcon(faServer, 'Server');
export const Globe = createIcon(faGlobe, 'Globe');
export const X = createIcon(faXmark, 'X');
export const Minus = createIcon(faMinus, 'Minus');
export const Zap = createIcon(faBolt, 'Zap');
export const ChevronRight = createIcon(faChevronRight, 'ChevronRight');
export const Database = createIcon(faDatabase, 'Database');
export const Check = createIcon(faCheck, 'Check');
export const FolderOpen = createIcon(faFolderOpen, 'FolderOpen');
export const Cpu = createIcon(faMicrochip, 'Cpu');
export const Layers = createIcon(faLayerGroup, 'Layers');
export const AlertCircle = createIcon(faCircleExclamation, 'AlertCircle');
export const Info = createIcon(faCircleInfo, 'Info');
export const AlertTriangle = createIcon(faTriangleExclamation, 'AlertTriangle');
export const HelpCircle = createIcon(faCircleQuestion, 'HelpCircle');
export const Radio = createIcon(faTowerBroadcast, 'Radio');
export const ShieldCheck = createIcon(faShieldHalved, 'ShieldCheck');
export const Gamepad = createIcon(faGamepad, 'Gamepad');
export const Route = createIcon(faRoute, 'Route');
export const Filter = createIcon(faFilter, 'Filter');
export const Sparkles = createIcon(faWandMagicSparkles, 'Sparkles');
export const Headphones = createIcon(faHeadphones, 'Headphones');
export const Monitor = createIcon(faDesktop, 'Monitor');
export const Sliders = createIcon(faSliders, 'Sliders');
export const ObjectUngroup = createIcon(faObjectUngroup, 'ObjectUngroup');
export const Edit = createIcon(faPenToSquare, 'Edit');
export const Copy = createIcon(faCopy, 'Copy');

// Custom Brand Application Logo (Lightning Bolt + Star Wing Emblem)
export const AppLogo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className = "w-4 h-4", fill = "currentColor", ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M324 12C337.5 19.2 342.1 36.2 333.8 49L264 156L476 205C493.4 209.1 499.8 230.6 487.1 243.3L380 350.4L308 302L376 234H220L324 12Z"
        fill={fill}
      />
      <path
        d="M188 500C174.5 492.8 169.9 475.8 178.2 463L248 356L36 307C18.6 302.9 12.2 281.4 24.9 268.7L132 161.6L204 210L136 278H292L188 500Z"
        fill={fill}
      />
    </svg>
  )
);
AppLogo.displayName = 'AppLogo';

// GitHub Brand Icon
export const Github = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className = "w-4 h-4", fill = "currentColor", ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
);
Github.displayName = 'Github';

