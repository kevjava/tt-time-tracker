/**
 * Re-export ExtendedTTDatabase as TimeTrackerDB for backward compatibility.
 * All database operations in tt-time-tracker should use TimeTrackerDB.
 */
export { ExtendedTTDatabase as TimeTrackerDB } from './extended-database';
