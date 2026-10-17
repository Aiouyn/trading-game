import { useId } from 'react';
import { MotorCar } from './icons';

export type Environment = 'office' | 'residence' | 'collection';

/** Native vector environments: material, perspective and light without bitmap assets. */
export function Architecture({ scene = 'office', color = '#7b8591' }: { scene?: Environment; color?: string }) {
  const id = useId().replaceAll(':', '');
  return <svg viewBox="0 0 800 340" fill="none" role="img" aria-label={`${scene === 'office' ? 'Private office overlooking Port Avalon' : scene === 'residence' ? 'Modern pavilion residence' : 'Private automotive collection'} architectural drawing`}>
    <defs>
      <linearGradient id={`${id}-glass`} x1="280" y1="10" x2="720" y2="270" gradientUnits="userSpaceOnUse"><stop stopColor="var(--drawing-glass)" stopOpacity=".65" /><stop offset="1" stopColor="var(--drawing-glass)" stopOpacity=".12" /></linearGradient>
      <linearGradient id={`${id}-floor`} x1="430" y1="210" x2="430" y2="340" gradientUnits="userSpaceOnUse"><stop stopColor="var(--drawing-material)" stopOpacity=".6" /><stop offset="1" stopColor="var(--drawing-material)" stopOpacity="0" /></linearGradient>
      <linearGradient id={`${id}-light`} x1="400" y1="0" x2="600" y2="340" gradientUnits="userSpaceOnUse"><stop stopColor="var(--drawing-brass)" stopOpacity=".18" /><stop offset="1" stopColor="var(--drawing-brass)" stopOpacity="0" /></linearGradient>
    </defs>
    {scene === 'office' ? <>
      <path d="M100 20h610v230H100z" fill="var(--drawing-material)" opacity=".25" />
      <path d="M260 30h450v195H260z" fill={`url(#${id}-glass)`} />
      <g fill="var(--drawing-city)" opacity=".55">
        <path d="M276 211v-59h20v-17h22v76zm58 0v-100h32v100zm46 0V73h35v138zm49 0v-60h24v-26h23v86zm58 0V98h31v113zm48 0v-38h34v38zm49 0V59h29v152zm44 0v-93h41v93zm60 0v-69h17v69z" />
      </g>
      <g stroke="var(--drawing-line)" strokeWidth="1">
        <path d="M100 20h610v230H100zM260 30h450v195H260zM410 30v195M560 30v195M260 146h450M100 250l-80 75M710 250l70 75M100 250h610M20 325h760" />
        <path d="M710 20l70-15v320M100 20L20 5v320" opacity=".45" />
      </g>
      <path d="M410 225l150-195 167 275H323z" fill={`url(#${id}-light)`} />
      <path d="M100 250h610l70 75H20z" fill={`url(#${id}-floor)`} />
      <g stroke="var(--drawing-line)" strokeWidth="1" opacity=".4"><path d="M180 250l-40 75M300 250l-20 75M490 250l20 75M610 250l40 75M62 286h677" /></g>
      <g fill="var(--drawing-material)" stroke="var(--drawing-line)" strokeWidth="1.2">
        <path d="M174 216l305-9 93 42-320 11z" /><path d="M252 260v53h-12v-55M541 253v48h12v-50" />
        <path d="M330 215v-52h86v49z" fill="var(--drawing-dark)" /><path d="M336 170h74v35h-74z" fill={`url(#${id}-glass)`} />
        <path d="M373 213v9M354 223h42M322 234l89-2 18 8-91 3" />
      </g>
      <g stroke="var(--drawing-brass)" strokeWidth="1.6"><path d="M216 220v-49l28-18M210 223h17M237 151l20 10-22 3z" /><path d="M141 60h73M141 111h73M141 163h73" opacity=".6" /></g>
      <g stroke="var(--drawing-line)" strokeWidth="1"><path d="M140 51v160h75V51M153 88V65h11v23M170 88V65h7v23M185 88V65h12v23M147 137h60M154 182v-12h37v12" /></g>
      <path d="M407 246l36-3 8 45-40 6z" fill="var(--drawing-dark)" stroke="var(--drawing-line)" /><path d="M412 294l39-6 17 9-40 9zM437 305v17M419 328l18-6 18 3" stroke="var(--drawing-line)" strokeWidth="1.4" />
      <path d="M650 249v-53M650 219c-16-10-22-25-14-33 13 4 18 19 14 33zm0-11c16-8 21-23 12-30-12 7-15 20-12 30z" stroke="var(--drawing-line)" /><path d="M637 247h26l-5 23h-16z" fill="var(--drawing-material)" stroke="var(--drawing-line)" />
      <path d="M260 30h450" stroke="var(--drawing-brass)" strokeWidth="2" opacity=".7" />
    </> : scene === 'residence' ? <>
      <path d="M65 256h690l-78 72H9z" fill={`url(#${id}-floor)`} />
      <path d="M223 106h475v133H223z" fill={`url(#${id}-glass)`} />
      <path d="M117 148h191v107H117zM515 107h46v147h-46" fill="var(--drawing-material)" />
      <path d="M205 94l477-16 66 21-506 16zM93 132l227-7 36 21-239 7z" fill="var(--drawing-material)" stroke="var(--drawing-line)" />
      <g stroke="var(--drawing-line)" strokeWidth="1.2"><path d="M117 153v102h582V101M223 116v124h476M308 150v89M404 111v128M515 108v131M561 106v133M630 104v135M223 179h476M93 255h650M65 256h690M66 270h666M54 283h663" /></g>
      <path d="M107 216h181v38H107z" fill="var(--drawing-dark)" opacity=".8" />
      <path d="M119 152h180M245 115h487" stroke="var(--drawing-brass)" strokeWidth="2" />
      <g stroke="var(--drawing-line)" opacity=".55"><path d="M116 167h177M116 181h177M116 195h177M347 235v-34h49v34M350 202h40M579 235v-30h43v30M582 208h37" /></g>
      <path d="M280 276h382l-68 49H214z" fill={`url(#${id}-glass)`} stroke="var(--drawing-line)" opacity=".65" />
      <path d="M269 289h355M249 304h350M297 277l-31 47M386 277l-25 47M473 277l-19 47M560 277l-13 47" stroke="var(--drawing-line)" opacity=".16" />
      <g stroke="var(--drawing-line)"><path d="M65 257v-85M65 183c-19-14-26-43-8-58 20 13 25 42 8 58zm0 5c19-12 24-34 11-46-16 14-17 30-11 46zM748 257v-78M748 193c-19-18-22-39-9-53 17 16 21 37 9 53z" /></g>
    </> : <>
      <path d="M79 35h652v227H79z" fill="var(--drawing-material)" opacity=".25" />
      <path d="M79 262h652l62 65H17z" fill={`url(#${id}-floor)`} />
      <g stroke="var(--drawing-line)" strokeWidth="1"><path d="M79 35h652v227H79zM79 262l-62 65M731 262l62 65M269 35v227M514 35v227M79 111h652M79 159h652M17 327h776" /><path d="M152 262l-25 65M317 262l-13 65M478 262l15 65M645 262l33 65" opacity=".35" /></g>
      <path d="M114 70h120M304 70h175M549 70h145" stroke="var(--drawing-brass)" strokeWidth="2" />
      <path d="M304 71l-12 192h199L479 71z" fill={`url(#${id}-light)`} />
      <g transform="translate(113 174) scale(.49)"><MotorCar color="var(--drawing-material)" /></g>
      <g transform="translate(322 170) scale(.69)"><MotorCar color={color} sports /></g>
      <path d="M677 186v53M666 186h22M666 239h22M564 276h146" stroke="var(--drawing-line)" />
    </>}
  </svg>;
}
