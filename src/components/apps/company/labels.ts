// Display names for the company's enums. Each reads its en or fr copy through t(), so the screens never show an enum id.
import type { CompanyRole, CompanySector, CompanyTierId } from '@/content/company';
import type { ExecRole, ExecTrait, ProjectKind } from '@/world/company/types';
import { t } from '@/i18n';

export const SECTOR_IDS: CompanySector[] = ['tech', 'health', 'staples', 'discretionary', 'industrials', 'security'];
export const ROLE_IDS: CompanyRole[] = ['ops', 'sales', 'rd', 'ga'];
export const EXEC_IDS: ExecRole[] = ['CEO', 'CFO', 'COO', 'CTO'];
export const TRAIT_IDS: ExecTrait[] = ['Operator', 'Visionary', 'Cost-cutter', 'Rainmaker', 'Steady'];
export const PROJECT_IDS: ProjectKind[] = ['quality', 'cost', 'nextgen'];
export const GOAL_IDS = ['firstHire', 'firstRevenue', 'breakEven', 'firstRound'] as const;

export const sectorLabel = (id: CompanySector): string => t(`company.label.sector.${id}`);
export const roleLabel = (id: CompanyRole): string => t(`company.label.role.${id}`);
export const tierLabel = (id: CompanyTierId): string => t(`company.label.tier.${id}`);
export const execLabel = (id: ExecRole): string => t(`company.label.exec.${id}`);
export const traitLabel = (id: ExecTrait): string => t(`company.label.trait.${id}`);
export const projectLabel = (id: ProjectKind): string => t(`company.label.project.${id}`);
