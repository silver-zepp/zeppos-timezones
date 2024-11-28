/**
 * A class for handling timezone conversions and related operations.
 *
 * @class
 */
export class Timezones {
    static "__#1@#simulated_date": any;
    /**
     * Sets a simulated current date for testing purposes or time travel :)
     * @param {Date|null} date_obj - The date to simulate as current, or null to reset.
     */
    static SetCurrentDate(date_obj: Date | null): void;
    /**
     * Gets the current date, using the simulated date if set.
     * @returns {Date} The current date or simulated date.
     */
    static GetCurrentDate(): Date;
    /**
     * Creates an instance of Timezones.
     *
     * @constructor
     * @param {string|number} [default_offset=null] - The default timezone offset.
     *        Accepted formats:
     *        - (number) Integer representing hours offset, e.g., -4
     *        - (string) IANA timezone identifier, e.g., "America/New_York"
     *        - (string) String representation of hours offset, e.g., "-5"
     * @example
     * // example: create a Timezones instance with New York timezone
     * const tz = new Timezones("America/New_York");
     *
     * // example: create a Timezones instance with -4 hours offset
     * const tz = new Timezones(-4);
     *
     * // example: create a Timezones instance with +5 hours & 30 minutes offset as string
     * const tz = new Timezones("+05:30"); // or just "+5"
     */
    constructor(default_offset?: string | number);
    /**
     * Gets the current date adjusted to the timezone of this instance.
     *
     * @returns {Date} A Date object representing the current date and time in the set timezone.
     * @example
     * const tz = new Timezones("America/New_York");
     * const date = tz.getDate();
     * console.log(date.toISOString()); // output: "2024-10-10T18:30:00.000Z"
     */
    getDate(): Date;
    /**
     * Gets the current time based on the default offset.
     *
     * @returns {string} The current time as an ISO string with offset.
     * @example
     * const cur_time = tz.getTime();
     * console.log(cur_time); // output: "2024-10-10T14:30:00.000-04:00"
     */
    getTime(): string;
    /**
     * Gets the current hour based on the default offset.
     *
     * @returns {number} The current hour (0-23).
     * @example
     * const cur_hour = tz.getHours();
     * console.log(cur_hour); // output: 14
     */
    getHours(): number;
    /**
     * Gets the current minutes based on the default offset.
     *
     * @returns {number} The current minutes (0-59).
     * @example
     * const cur_min = tz.getMinutes();
     * console.log(cur_min); // output: 30
     */
    getMinutes(): number;
    /**
     * Gets the current seconds based on the default offset.
     *
     * @returns {number} The current seconds (0-59).
     * @example
     * const cur_sec = tz.getSeconds();
     * console.log(cur_sec); // output: 45
     */
    getSeconds(): number;
    /**
     * Converts a date to a specified timezone.
     *
     * @param {Date} date - The date to convert.
     * @param {string} target_tz - The target timezone. Can be:
     *        - IANA timezone identifier (e.g., "Asia/Tokyo")
     *        - Offset in '±HH' format (e.g., "+09")
     * @returns {Date} The converted date.
     * @throws {Error} If the timezone format is invalid.
     * @example
     * const date = new Date("2024-10-10T12:00:00Z");
     * const tokyo_time = tz.convertToTimeZone(date, 'Asia/Tokyo');
     * console.log(tokyo_time); // output: 2024-10-10T21:00:00.000Z (equivalent to 21:00 in Tokyo)
     */
    convertToTimeZone(date: Date, target_tz: string): Date;
    /**
     * Gets the current location based on the default offset.
     *
     * @returns {string} The determined location (IANA timezone identifier).
     * @example
     * const location = tz.getLocation();
     * console.log(location); // output: "America/New_York"
     */
    getLocation(): string;
    /**
     * Clears the cached location and DST status.
     * Forces a recalculation of the location and DST status on the next call to getLocation() or getDaylightStatus().
     *
     * @example
     * // execute if something doesn't look right
     * tz.clearCache();
     * const new_location = tz.getLocation();
     */
    clearCache(): void;
    /**
     * Determines if Daylight Saving Time (DST) is currently in effect for a given location.
     *
     * @param {string} location - The location (IANA timezone identifier).
     * @returns {boolean} True if DST is in effect, false otherwise.
     * @example
     * const is_dst = tz.getDaylightStatus('America/New_York');
     * console.log(is_dst); // output: true (during DST period)
     */
    getDaylightStatus(location: string): boolean;
    /**
     * Gets the current location and DST status.
     *
     * @returns {{location: string, is_dst: boolean}} An object containing the location and DST status.
     * @example
     * const { location, is_dst } = tz.getLocationAndDaylightStatus();
     * console.log(location, is_dst); // output: "America/New_York" true
     */
    getLocationAndDaylightStatus(): {
        location: string;
        is_dst: boolean;
    };
    /**
     * Get detailed timezone information for a given identifier.
     * @param {string} identifier - The timezone identifier (e.g., "America/New_York" or "US")
     * @returns {Object|null} An object containing timezone details, or null if not found
     */
    getTimezoneInfo(identifier: string): any | null;
    /**
     * Finds the approximate timezone location based on given latitude and longitude.
     * Can be used along with a GPS module to create a generic locator.
     * @param {number} latitude - The latitude of the location in decimal degrees.
     * @param {number} longitude - The longitude of the location in decimal degrees.
     * @returns {string} The timezone `IANA` ID of the nearest location in the database.
     */
    getApproxLocation(latitude: number, longitude: number): string;
    /**
     * Get the time until the next DST change (either on or off).
     * @returns {Object|null} An object containing the next DST change date and the time until that change, or null if the timezone doesn't observe DST.
     * @property {Date} next_change - The date of the next DST change.
     * @property {number} time_until_change - The time in milliseconds until the next change.
     * @property {boolean} change_to_dst - True if changing to DST, false if changing from DST.
     * @example
     * const tz = new Timezones("America/New_York");
     * const dst_change = tz.getTimeUntilNextDstChange();
     *
     * if (dst_change) {
     *   console.log("Next DST change:", dst_change.next_change);
     *   console.log("Time until change:", dst_change.time_until_change, "ms");
     *   console.log("Changing to DST:", dst_change.change_to_dst);
     * } else {
     *   console.log("This timezone does not observe DST");
     * }
     *
     * // example output:
     * // Next DST change: 2024-10-10T00:00:00.000Z
     * // Time until change: 69360420 ms
     * // Changing to DST: false
     */
    getTimeUntilNextDstChange(): any | null;
    /**
     * Formats the time until the next DST change as a human-readable string.
     * @returns {string} A formatted string describing the time until the next DST change,
     *                   or a message indicating that the timezone doesn't observe DST.
     * @example
     * // returns: "Time until DST starts: 45 days, 6 hours, 30 minutes, and 15 seconds"
     * tz.formatTimeUntilNextDstChange();
     *
     * // Or if DST is not observed:
     * // returns: "No DST changes for this timezone."
     * tz.formatTimeUntilNextDstChange();
     */
    formatTimeUntilNextDstChange(): string;
    #private;
}
