// T02-11: view handlers (read-only queries over StoreRead).
import type { ZodType } from 'zod';
import type { StoreRead } from '../store';
import type { Id } from '../types';

export interface ViewerContext { viewerId: Id | null; isAdmin: boolean; partyOf(ids: readonly Id[]): boolean }
export interface ViewHandler<A = unknown, R = unknown> { id: string; schema: ZodType<A>; run(store: StoreRead, args: A, viewer: ViewerContext): R }
