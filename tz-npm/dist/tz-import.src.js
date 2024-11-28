/** @about Timezones 1.0.0 @min_zeppos 2.0 @author: Silver, Zepp Health. @license: MIT */
import { debugLog, setupLogger } from "./silver-log";
import { core_tz_db } from "./tz-db"

const VERSION = "1.0.0";

setupLogger({
	prefix: "tz v" + VERSION,
	level: 1
});

/**
 * A class for handling timezone conversions and related operations.
 * 
 * @class
 */
export class Timezones {
	#default_offset = null;
	#default_offset_mins = null;
	#similarity_threshold = 0.5; // for the best match guess. lower - more precise
	#location_cache = null;
	#dst_status_cache = null;
	#tz_info_cache = new Map();
	#offset_cache = new Map();
	#dst_cache = new Map();
	#nth_week_cache = new Map();
	#tz_data = null;
	#full_tz_db = null;
	#spatial_index = null;

	// valid continents
	#CONTINENTS = ['Africa', 'America', 'Antarctica', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific'];
	#HH_MM_OFFSET_REGEX = /^[-+]?\d{1,2}(:\d{2})?$/; // reg for +04:30 support

	static #simulated_date = null;

	get #tz_db() {
		if (this.#full_tz_db === null) {
			this.#full_tz_db = core_tz_db;
		}
		return this.#full_tz_db;
	}

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
	constructor(default_offset = null) {
		debugLog(3, `Constructor called with default_offset: ${default_offset}`);
		this.#default_offset = default_offset;
		this.#default_offset_mins = null;

		if (typeof this.#default_offset === 'string') {
			this.#tz_data = this.#initializeTimezoneData(this.#default_offset);
		}

		if (typeof this.#default_offset === 'string' && this.#default_offset.toLowerCase().startsWith('utc')) {
			this.#default_offset = this.#default_offset.slice(3); // remove 'UTC' prefix
		}

		// lazy init of default_offset_mins
		Object.defineProperty(this, '#default_offset_mins', {
			get: () => {
				if (this.#default_offset_mins === null) {
					this.#initializeDefaultOffset();
				}
				return this.#default_offset_mins;
			},
			set: (value) => {
				this.#default_offset_mins = value;
			}
		});
	}

	#findTZbyAbbreviation(identifier){
		// fallback: try to find by abbreviation (country_abbr or tz_sdt or tz_dst)
		return core_tz_db.find(
			//    		country									sdt										dst
			tz => tz[0] === identifier || tz[4] === identifier || tz[5] === identifier
		);
	}

	#initializeTimezoneData(identifier) {
		let tz_entry = core_tz_db.find(tz => tz[1] === identifier);

		if (!tz_entry) {
			tz_entry = this.#findTZbyAbbreviation(identifier);
		}

		if (tz_entry) {
			return {
				code: tz_entry[0],
				tz_id: tz_entry[1],
				utc_sdt: tz_entry[2],
				utc_dst: tz_entry[3],
				tz_sdt: tz_entry[4],
				tz_dst: tz_entry[5],
				continent: tz_entry[6],
				lat: tz_entry[7],
				lon: tz_entry[8],
				dst_rule: tz_entry[9]
			};
		}
		return null;
	}

	#initializeDefaultOffset() {
		if (this.#default_offset !== null) {
			try {
				if (typeof this.#default_offset === 'number') {
					this.#default_offset_mins = this.#default_offset * 60;
				} else if (typeof this.#default_offset === 'string') {
					let offset_str = this.#default_offset;

					// handle UTC notation
					if (offset_str.toLowerCase().includes('utc')) {
						offset_str = offset_str.toLowerCase().replace('utc', '').trim();
						if (offset_str === '') offset_str = '+0'; // UTC with no offset == +0
					}

					if (this.#HH_MM_OFFSET_REGEX.test(offset_str)) {
						this.#default_offset_mins = this.#str2offset(offset_str);
					} else {
						const { location, is_dst } = this.getLocationAndDaylightStatus();
						const tz_info = this.#tz_db.find(tz => tz[1] === location);
						if (tz_info) {
							const tz_offset_str = is_dst ? tz_info[3] : tz_info[2];
							this.#default_offset_mins = this.#str2offset(tz_offset_str);
						} else {
							throw new Error('Invalid timezone');
						}
					}
				} else {
					throw new Error('Invalid offset format');
				}
			} catch (err) {
				debugLog(3, `Error initializing default offset: ${err.message}`);
				this.#default_offset = null;
				this.#default_offset_mins = -Timezones.GetCurrentDate().getTimezoneOffset();
			}
		} else {
			this.#default_offset_mins = -Timezones.GetCurrentDate().getTimezoneOffset();
		}
	}

	/**
	 * Gets the current date adjusted to the timezone of this instance.
	 *
	 * @returns {Date} A Date object representing the current date and time in the set timezone.
	 * @example
	 * const tz = new Timezones("America/New_York");
	 * const date = tz.getDate();
	 * console.log(date.toISOString()); // output: "2024-10-10T18:30:00.000Z"
	 */
	getDate() {
		const { location, is_dst } = this.getLocationAndDaylightStatus();
		const tz_info = this.#tz_db.find(tz => tz[1] === location);

		let offset_mins, offset_str, tz_abbr;
		if (tz_info) {
			offset_str = is_dst ? tz_info[3] : tz_info[2];
			tz_abbr = is_dst ? tz_info[5] : tz_info[4];
			offset_mins = this.#str2offset(offset_str);
		} else {
			offset_mins = this.#default_offset_mins;
			offset_str = this.#offset2str(offset_mins);
			tz_abbr = "UTC" + offset_str;
		}

		const utc_now = Timezones.GetCurrentDate().getTime();
		const local_time = new Date(utc_now + offset_mins * 60000);

		const result = { // Date object reconstruction
			/** @returns {number} The full year (e.g., 2024) */
			getFullYear: () => local_time.getUTCFullYear(),
			/** @returns {number} The month (0-11) */
			getMonth: () => local_time.getUTCMonth(),
			/** @returns {number} The day of the month (1-31) */
			getDate: () => local_time.getUTCDate(),
			/** @returns {number} The day of the week (0-6) */
			getDay: () => local_time.getUTCDay(),
			/** @returns {number} The hour (0-23) */
			getHours: () => local_time.getUTCHours(),
			/** @returns {number} The minutes (0-59) */
			getMinutes: () => local_time.getUTCMinutes(),
			/** @returns {number} The seconds (0-59) */
			getSeconds: () => local_time.getUTCSeconds(),
			/** @returns {number} The milliseconds (0-999) */
			getMilliseconds: () => local_time.getUTCMilliseconds(),
			/** @returns {number} The number of milliseconds since January 1, 1970 00:00:00 UTC */
			getTime: () => local_time.getTime(),
			/** @returns {number} The time zone offset in minutes */
			getTimezoneOffset: () => -offset_mins,
			/** @returns {number} The day of the month, according to universal time (1-31) */
			getUTCDate: () => local_time.getUTCDate(),
			/** @returns {number} The day of the week, according to universal time (0-6) */
			getUTCDay: () => local_time.getUTCDay(),
			/** @returns {number} The full year, according to universal time (e.g., 2024) */
			getUTCFullYear: () => local_time.getUTCFullYear(),
			/** @returns {number} The hour, according to universal time (0-23) */
			getUTCHours: () => local_time.getUTCHours(),
			/** @returns {number} The milliseconds, according to universal time (0-999) */
			getUTCMilliseconds: () => local_time.getUTCMilliseconds(),
			/** @returns {number} The minutes, according to universal time (0-59) */
			getUTCMinutes: () => local_time.getUTCMinutes(),
			/** @returns {number} The month, according to universal time (0-11) */
			getUTCMonth: () => local_time.getUTCMonth(),
			/** @returns {number} The seconds, according to universal time (0-59) */
			getUTCSeconds: () => local_time.getUTCSeconds(),
			/** @returns {string} A string representation of the date in ISO format */
			toISOString: () => this.#formatDateWithOffset(local_time, offset_mins),
			/** @returns {string} A string representation of the date */
			toString: () => {
				const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
				return `${days[local_time.getUTCDay()]} ${months[local_time.getUTCMonth()]} ${local_time.getUTCDate().toString().padStart(2, '0')} ${local_time.getUTCFullYear()} ` +
					`${local_time.getUTCHours().toString().padStart(2, '0')}:${local_time.getUTCMinutes().toString().padStart(2, '0')}:${local_time.getUTCSeconds().toString().padStart(2, '0')} ` +
					`GMT${offset_str} (${tz_abbr})`;
			},
			/** @returns {string} A string representation of the date in UTC time zone */
			toUTCString: () => local_time.toUTCString(),
			/** @returns {string} A JSON representation of the date */
			toJSON: () => local_time.toJSON(),
			/** @returns {string} A string representation of the date using the current locale */
			toLocaleString: () => this.toString(),
			/** @returns {number} The primitive value of the Date object */
			valueOf: () => local_time.getTime(),
		};

		return result;
	}

	/**
	 * Gets the current time based on the default offset.
	 *
	 * @returns {string} The current time as an ISO string with offset.
	 * @example
	 * const cur_time = tz.getTime();
	 * console.log(cur_time); // output: "2024-10-10T14:30:00.000-04:00"
	 */
	getTime() {
		let offset_mins, offset_str;

		if (this.#tz_data) {
			const is_dst = this.getDaylightStatus();
			offset_str = is_dst ? this.#tz_data.utc_dst : this.#tz_data.utc_sdt;
			offset_mins = this.#str2offset(offset_str);
		} else {
			const { location, is_dst } = this.getLocationAndDaylightStatus();
			const tz_info = this.#tz_db.find(tz => tz[1] === location);

			if (tz_info) {
				offset_str = is_dst ? tz_info[3] : tz_info[2];
				offset_mins = this.#str2offset(offset_str);
			} else {
				offset_mins = this.#default_offset_mins;
				offset_str = this.#offset2str(offset_mins);
			}
		}

		const cur_date = Timezones.GetCurrentDate();
		const date_with_offset = new Date(cur_date.getTime() + offset_mins * 60000);
		const result = this.#formatDateWithOffset(date_with_offset, offset_mins);

		return result;
	}

	/**
	 * Gets the current hour based on the default offset.
	 *
	 * @returns {number} The current hour (0-23).
	 * @example
	 * const cur_hour = tz.getHours();
	 * console.log(cur_hour); // output: 14
	 */
	getHours() {
		let result;

		if (this.#tz_data) {
			const cur_time = Timezones.GetCurrentDate();
			const is_dst = this.getDaylightStatus();
			const offset_str = is_dst ? this.#tz_data.utc_dst : this.#tz_data.utc_sdt;
			const offset_mins = this.#str2offset(offset_str);
			const date_with_offset = new Date(cur_time.getTime() + offset_mins * 60000);
			result = date_with_offset.getUTCHours();
		} else {
			result = this.#getCurrentTimeWithOffset().getUTCHours();
		}

		return result;
	}

	/**
	 * Gets the current minutes based on the default offset.
	 *
	 * @returns {number} The current minutes (0-59).
	 * @example
	 * const cur_min = tz.getMinutes();
	 * console.log(cur_min); // output: 30
	 */
	getMinutes() {
		let result;

		if (this.#tz_data) {
			const cur_time = Timezones.GetCurrentDate();
			const is_dst = this.getDaylightStatus();
			const offset_str = is_dst ? this.#tz_data.utc_dst : this.#tz_data.utc_sdt;
			const offset_mins = this.#str2offset(offset_str);
			const date_with_offset = new Date(cur_time.getTime() + offset_mins * 60000);
			result = date_with_offset.getUTCMinutes();
		} else {
			result = this.#getCurrentTimeWithOffset().getUTCMinutes();
		}

		return result;
	}

	/**
	 * Gets the current seconds based on the default offset.
	 *
	 * @returns {number} The current seconds (0-59).
	 * @example
	 * const cur_sec = tz.getSeconds();
	 * console.log(cur_sec); // output: 45
	 */
	getSeconds() {
		let result;

		if (this.#tz_data) {
			const cur_time = Timezones.GetCurrentDate();
			const is_dst = this.getDaylightStatus();
			const offset_str = is_dst ? this.#tz_data.utc_dst : this.#tz_data.utc_sdt;
			const offset_mins = this.#str2offset(offset_str);
			const date_with_offset = new Date(cur_time.getTime() + offset_mins * 60000);
			result = date_with_offset.getUTCSeconds();
		} else {
			result = this.#getCurrentTimeWithOffset().getUTCSeconds();
		}

		return result;
	}

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
	convertToTimeZone(date, target_tz) {
		let offset_mins;

		if (typeof target_tz === 'string' && /^[-+]\d+$/.test(target_tz)) {
			offset_mins = parseInt(target_tz, 10) * 60;
		} else {
			const tz_info = this.getTimezoneInfo(target_tz);
			if (tz_info) {
				const is_dst = this.#isDstPeriod(date, tz_info.dst_rule);
				const offset = is_dst ? tz_info.utc_dst : tz_info.utc_sdt;
				offset_mins = this.#str2offset(offset);
			} else {
				throw new Error(`Invalid timezone format. Expected format: '±HH' or a valid IANA timezone identifier.`);
			}
		}

		return this.#applyOffsetToDate(date, offset_mins);
	}

	/**
	 * Gets the current location based on the default offset.
	 *
	 * @returns {string} The determined location (IANA timezone identifier).
	 * @example
	 * const location = tz.getLocation();
	 * console.log(location); // output: "America/New_York"
	 */
	getLocation() {
		if (this.#tz_data) {
			return this.#tz_data.tz_id;
		}

		if (this.#location_cache === null) {
			const cur_time_with_offset = Timezones.GetCurrentDate();
			const current_tz_offset = this.#calculateTZ(cur_time_with_offset);
			const offset_str = this.#offset2str(current_tz_offset);
			const is_dst_now = this.#isDstNow(current_tz_offset);
			let location = null;

			if (this.#default_offset) {
				if (typeof this.#default_offset === 'number') {
					this.#default_offset_mins = this.#default_offset * 60;
				} else if (typeof this.#default_offset === 'string') {
					if (this.#HH_MM_OFFSET_REGEX.test(this.#default_offset)) {
						// handle string format "+04:30"
						this.#default_offset_mins = this.#str2offset(this.#default_offset);
					} else {
						// handle tz name format
						const [continent, city] = this.#default_offset.split('/');
						const continent_matches = this.#tz_db.filter(tz => tz[1].startsWith(continent + '/'));

						if (continent_matches.length > 0) {
							location = this.#selectBestMatchingTimeZone(continent_matches);
							debugLog(3, `Selected timezone based on default offset continent: ${location}`);
						} else {
							debugLog(3, `No matching continent found for: ${this.#default_offset}`);
							location = 'Unknown';
						}
					}
				}

				if (!location && this.#default_offset_mins !== null) {
					debugLog(3, `Finding timezone for default offset: ${this.#default_offset} (${this.#default_offset_mins} minutes)`);
					const matching_tzs = this.#findTimeZoneByOffset(this.#default_offset_mins, is_dst_now);
					location = this.#selectBestMatchingTimeZone(matching_tzs);
				}
			}

			// if can't find loca based on the default offset use current offset
			if (!location) {
				debugLog(3, `Using current tz offset: ${current_tz_offset}`);
				let matching_tzs = this.#findTimeZoneByOffset(current_tz_offset, is_dst_now);
				debugLog(3, "Amount of matching timezones: ", matching_tzs.length);
				location = this.#selectBestMatchingTimeZone(matching_tzs);
			}

			// fallback if location is still null
			if (location === null) {
				debugLog(3, "No matching timezone found for offset: ", offset_str);
				const fallback_timezones = this.#tz_db.filter(tz => tz[2] === offset_str || tz[3] === offset_str);
				if (fallback_timezones.length > 0) {
					location = this.#selectBestMatchingTimeZone(fallback_timezones);
					debugLog(3, "Fallback timezone selected based on offset: ", location);
				} else if (this.country_code) {
					const country_fallback = this.#tz_db.filter(tz => tz[0] === this.country_code);
					if (country_fallback.length > 0) {
						location = this.#selectBestMatchingTimeZone(country_fallback);
						debugLog(3, "Fallback timezone selected based on country code: ", location);
					}
				}
			}

			// if location is still null, set to Unknown
			if (location === null) {
				location = 'Unknown';
			}

			if (location !== 'Unknown') {
				this.#default_offset_mins = this.#determineOffset(location);
			}

			this.#location_cache = location;
		}

		return this.#location_cache;
	}

	/**
	 * Clears the cached location and DST status.
	 * Forces a recalculation of the location and DST status on the next call to getLocation() or getDaylightStatus().
	 * 
	 * @example
	 * // execute if something doesn't look right
	 * tz.clearCache();
	 * const new_location = tz.getLocation();
	 */
	clearCache() {
		this.#location_cache = null;
		this.#dst_status_cache = null;
		this.#dst_cache.clear();
		this.#offset_cache.clear();
		this.#tz_info_cache.clear();
		this.#nth_week_cache.clear();
	}

	/**
	 * Determines if Daylight Saving Time (DST) is currently in effect for a given location.
	 *
	 * @param {string} location - The location (IANA timezone identifier).
	 * @returns {boolean} True if DST is in effect, false otherwise.
	 * @example
	 * const is_dst = tz.getDaylightStatus('America/New_York');
	 * console.log(is_dst); // output: true (during DST period)
	 */
	getDaylightStatus(location) {
		if (this.#tz_data) {
			const cur_date = Timezones.GetCurrentDate();
			return this.#isDstPeriod(cur_date, this.#tz_data.dst_rule);
		}

		if (this.#dst_status_cache === null) {
			const tz_info = this.#tz_db.find(tz => tz[1] === location);
			if (!tz_info) {
				debugLog(3, `Timezone not found: ${location}`);
				return false;
			}

			const dst_rule = tz_info[9]; // DST rule -> 10th position
			if (dst_rule === "00") {
				debugLog(3, `No DST for ${location}`);
				return false;
			}

			const cur_date = Timezones.GetCurrentDate();
			const is_dst = this.#isDstPeriod(cur_date, dst_rule);
			debugLog(3, `DST status for ${location}: ${is_dst}`);

			this.#dst_status_cache = is_dst;
		}

		return this.#dst_status_cache;
	}

	/**
	 * Gets the current location and DST status.
	 *
	 * @returns {{location: string, is_dst: boolean}} An object containing the location and DST status.
	 * @example
	 * const { location, is_dst } = tz.getLocationAndDaylightStatus();
	 * console.log(location, is_dst); // output: "America/New_York" true
	 */
	getLocationAndDaylightStatus() {
		let result;

		if (this.#tz_data) {
			const location = this.#tz_data.tz_id;
			const is_dst = this.getDaylightStatus();
			result = { location, is_dst };
		} else {
			const location = this.getLocation();
			const is_dst = this.getDaylightStatus();
			result = { location, is_dst };
		}

		return result;
	}

	/**
	 * Get detailed timezone information for a given identifier.
	 * @param {string} identifier - The timezone identifier (e.g., "America/New_York" or "US")
	 * @returns {Object|null} An object containing timezone details, or null if not found
	 */
	getTimezoneInfo(identifier) {
		let result;

		if (this.#tz_data && (this.#tz_data.tz_id === identifier || this.#tz_data.code === identifier)) {
			result = this.#tz_data;
		} else {
			let tz_entry = this.#tz_db.find(tz => tz[1] === identifier || tz[0] === identifier);

			if (!tz_entry) {
				tz_entry = this.#findTZbyAbbreviation(identifier);
			}

			if (tz_entry) {
				result = {
					code: tz_entry[0],
					tz_id: tz_entry[1],
					utc_sdt: tz_entry[2],
					utc_dst: tz_entry[3],
					tz_sdt: tz_entry[4],
					tz_dst: tz_entry[5],
					continent: tz_entry[6],
					lat: tz_entry[7],
					lon: tz_entry[8],
					dst_rule: tz_entry[9]
				};
			} else {
				result = null;
			}
		}

		return result;
	}

	/**
	 * Finds the approximate timezone location based on given latitude and longitude.
	 * Can be used along with a GPS module to create a generic locator.
	 * @param {number} latitude - The latitude of the location in decimal degrees.
	 * @param {number} longitude - The longitude of the location in decimal degrees.
	 * @returns {string} The timezone `IANA` ID of the nearest location in the database.
	 */
	getApproxLocation(latitude, longitude) {
		// quick & dirty approximation; ~4x faster than haversine's
		if (!this.#spatial_index) {
			this.#spatial_index = this.#tz_db.map((tz, index) => ({
				index,
				lat: (tz[7] * 10000 + 0.5),  // inline round
				lon: (tz[8] * 10000 + 0.5)
			}));
		}

		// round input to match db precision
		const lat = (latitude * 10000);
		const lon = (longitude * 10000);

		let nearest_index = 0;
		let min_dist = Number.MAX_SAFE_INTEGER;

		for (let i = 0; i < this.#spatial_index.length; i++) {
			const tz = this.#spatial_index[i];
			// d = |x_1 - x_2| + |y_1 - y_2|
			const lat_diff = lat > tz.lat ? lat - tz.lat : tz.lat - lat; // inline abs
			const lon_diff = lon > tz.lon ? lon - tz.lon : tz.lon - lon;
			const dist = lat_diff + lon_diff;
			if (dist < min_dist) {
				min_dist = dist;
				nearest_index = tz.index;
			}
		}

		const result = this.#tz_db[nearest_index][1]; // return tz_id

		return result;
	}

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
	getTimeUntilNextDstChange() {
		const now = this.getDate();
		const cur_year = now.getFullYear();
		const next_year = cur_year + 1;

		const tz_info = this.getTimezoneInfo(this.#tz_data?.tz_id);
		const dst_rule = tz_info?.dst_rule;

		if (dst_rule == undefined || dst_rule === "00") {
			return null; // 00 -> no DST
		}

		const rule = parseInt(dst_rule, 16);
		const start_month = (rule & 0x0F);
		const start_week = ((rule >> 4) & 0x07);
		const end_month = ((rule >> 8) & 0x0F);
		const end_week = ((rule >> 12) & 0x07);
		
		const calculateDstDate = (year, month, week) => {
			const day = this.#nthWeekdayOfMonth(year, month, 0, week);
			return new Date(Date.UTC(year, month - 1, day, 2, 0, 0));
		};
		
		const dst_start_cur = calculateDstDate(cur_year, start_month, start_week);
		const dst_end_cur = calculateDstDate(cur_year, end_month, end_week);
		const dst_start_next = calculateDstDate(next_year, start_month, start_week);

		let next_change, change_to_dst;
		const now_utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()));

		if (now_utc < dst_start_cur) {
			next_change = dst_start_cur;
			change_to_dst = true;
		} else if (now_utc < dst_end_cur) {
			next_change = dst_end_cur;
			change_to_dst = false;
		} else {
			next_change = dst_start_next;
			change_to_dst = true;
		}

		const time_until_change = next_change.getTime() - now_utc.getTime();

		return {
			next_change,
			time_until_change,
			change_to_dst
		};
	}

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
	formatTimeUntilNextDstChange() {
		const dst_change_info = this.getTimeUntilNextDstChange();

		if (!dst_change_info) {
			return "No DST changes for this timezone.";
		}

		const { time_until_change, change_to_dst } = dst_change_info;

		const d = Math.floor(time_until_change / (1000 * 60 * 60 * 24));
		const h = Math.floor((time_until_change % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const m = Math.floor((time_until_change % (1000 * 60 * 60)) / (1000 * 60));
		const s = Math.floor((time_until_change % (1000 * 60)) / 1000);

		const change_type = change_to_dst ? "starts" : "ends";

		return `Time until DST ${change_type}: ${d} days, ${h} hours, ${m} minutes, and ${s} seconds`;
	}

	/**
	 * Sets a simulated current date for testing purposes or time travel :)
	 * @param {Date|null} date_obj - The date to simulate as current, or null to reset.
	 */
	static SetCurrentDate(date_obj) {
		Timezones.#simulated_date = date_obj instanceof Date ? date_obj : null;
	}

	/**
	 * Gets the current date, using the simulated date if set.
	 * @returns {Date} The current date or simulated date.
	 */
	static GetCurrentDate() {
		return Timezones.#simulated_date || new Date();
	}

	#determineOffset(timezone) {
		if (typeof timezone !== 'string') {
			throw new Error('Invalid timezone format');
		}

		const first_slash_index = timezone.indexOf('/');
		if (first_slash_index === -1) {
			throw new Error('Invalid timezone format');
		}

		const continent = timezone.substring(0, first_slash_index);
		const city = timezone.substring(first_slash_index + 1);

		if (!continent || !city) {
			throw new Error('Invalid timezone format');
		}

		debugLog(3, `Extracted continent: ${continent}`);
		debugLog(3, `Extracted city: ${city}`);

		const matching_tzs = this.#tz_db.filter(tz => tz[1] === timezone);

		if (matching_tzs.length > 0) {
			return this.#str2offset(matching_tzs[0][2]);
		}

		// partial match guess
		return this.#guessTimeZoneFromPartialId(continent, city);
	}

	#guessTimeZoneFromPartialId(continent, city) {
		if (!this.#CONTINENTS.includes(continent)) {
			debugLog(3, `Invalid continent: ${continent}. Attempting to find a matching city.`);
			const possible_tzs = this.#tz_db.filter(tz => {
				const [, tz_city] = tz[1].split('/');
				return tz_city && tz_city.toLowerCase().includes(city.toLowerCase());
			});

			if (possible_tzs.length > 0) {
				debugLog(3, `Guessed timezone: ${possible_tzs[0][1]}`);
				return this.#str2offset(possible_tzs[0][2]);
			}
		} else {
			const possible_tzs = this.#tz_db.filter(tz => {
				const [tz_continent, tz_city] = tz[1].split('/');
				return tz_continent === continent && tz_city && tz_city.toLowerCase().includes(city.toLowerCase());
			});

			if (possible_tzs.length > 0) {
				debugLog(3, `Guessed timezone: ${possible_tzs[0][1]}`);
				return this.#str2offset(possible_tzs[0][2]);
			}

			const fallback = this.#tz_db.find(tz => tz[1].startsWith(`${continent}/`));
			if (fallback) {
				debugLog(3, `No match found. Falling back to: ${fallback[1]}`);
				return this.#str2offset(fallback[2]);
			}
		}

		throw new Error(`Unable to determine offset for timezone: ${continent}/${city}`);
	}

	#getCurrentTimeWithOffset() {
		let result;

		if (this.#tz_data) {
			const cur_date = Timezones.GetCurrentDate();
			const is_dst = this.getDaylightStatus();
			const offset_str = is_dst ? this.#tz_data.utc_dst : this.#tz_data.utc_sdt;
			const offset_mins = this.#str2offset(offset_str);
			result = new Date(cur_date.getTime() + offset_mins * 60000);
		} else {
			const { location, is_dst } = this.getLocationAndDaylightStatus();
			const tz_info = this.#tz_db.find(tz => tz[1] === location);

			let offset_mins;
			if (tz_info) {
				const offset_str = is_dst ? tz_info[3] : tz_info[2];
				offset_mins = this.#str2offset(offset_str);
			} else {
				offset_mins = this.#default_offset_mins;
			}

			const cur_date = Timezones.GetCurrentDate();
			result = new Date(cur_date.getTime() + offset_mins * 60000);
		}

		return result;
	}

	#calculateTZ(date_with_offset) {
		if (this.#default_offset_mins !== null) {
			return this.#default_offset_mins;
		} else {
			return -date_with_offset.getTimezoneOffset();
		}
	}

	#findTimeZoneByOffset(tz_offset, is_dst_now) {
		const cache = `${tz_offset}_${is_dst_now}`;
		if (this.#tz_info_cache.has(cache)) {
			return this.#tz_info_cache.get(cache);
		}

		const offset_str = this.#normalizeOffset(tz_offset);

		const matching_tzs = this.#tz_db.filter(tz => {
			const std_offset = this.#normalizeOffset(tz[2]);
			const dst_offset = this.#normalizeOffset(tz[3]);
			return (is_dst_now ? dst_offset : std_offset) === offset_str;
		});

		this.#tz_info_cache.set(cache, matching_tzs);

		return matching_tzs;
	}

	#normalizeOffset(tz_offset) {
		if (typeof tz_offset === 'number') {
			const h = Math.floor(Math.abs(tz_offset) / 60);
			const m = Math.abs(tz_offset) % 60;
			const result = `${tz_offset < 0 ? '-' : '+'}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
			return result;
		} else if (typeof tz_offset === 'string') {
			const match = tz_offset.match(/^([+-])(\d{2}):?(\d{2})$/);
			if (match) {
				const result = `${match[1]}${match[2]}:${match[3]}`;
				return result;
			}
		}
		throw new Error('Invalid offset format');
	}

	#isDstNow(tz_offset) {
		if (this.#default_offset_mins !== null) {
			const offset_str = this.#offset2str(this.#default_offset_mins);
			return this.#tz_db.some(tz => tz.utc_dst === offset_str);
		} else {
			const offset_str = this.#offset2str(tz_offset);
			return this.#tz_db.some(tz => tz.utc_dst === offset_str);
		}
	}

	#selectBestMatchingTimeZone(matching_tzs) {
		if (!Array.isArray(matching_tzs) || matching_tzs.length === 0) {
			debugLog(3, "No matching timezones found or invalid input");
			return null;
		}

		debugLog(3, `Matching timezones: ${JSON.stringify(matching_tzs.slice(0, 5))}...`);

		if (matching_tzs.length === 1) {
			debugLog(3, "Single timezone match found:", matching_tzs[0][1]);
			return matching_tzs[0][1];
		}

		const non_deprecated = matching_tzs.filter(tz => !tz[1].includes('Etc/'));
		const filtered_tzs = non_deprecated.length > 0 ? non_deprecated : matching_tzs;

		if (this.#default_offset && typeof this.#default_offset === 'string') {
			const [continent, city] = this.#default_offset.split('/');
			const continent_matches = filtered_tzs.filter(tz => tz[1].startsWith(continent + '/'));

			if (continent_matches.length > 0) {
				debugLog(3, `Found ${continent_matches.length} matches for continent ${continent}`);

				const exact_match = continent_matches.find(tz => tz[1] === this.#default_offset);
				if (exact_match) {
					debugLog(3, "Exact match found:", exact_match[1]);
					return exact_match[1];
				}

				const best_match = this.#findBestMatch(city, continent_matches);
				if (best_match) {
					debugLog(3, `Found a close match with similarity ${best_match.similarity}: ${best_match.tz[1]}`);
					return best_match.tz[1];
				}

				debugLog(3, `No close match found. Returning first continent match: ${continent_matches[0][1]}`);
				return continent_matches[0][1];
			}
		}

		debugLog(3, "No continent match or default offset. Selecting first match:", filtered_tzs[0][1]);

		return filtered_tzs[0][1];
	}

	#findBestMatch(city, tzs) {
		let best_match = null;
		let best_similarity = 0;

		tzs.forEach(tz => {
			const [, tz_city] = tz[1].split('/');
			const similarity = this.#calculateStringSimilarity(city, tz_city);
			debugLog(3, `Similarity between ${tz_city} and ${city}: ${similarity}`);
			if (similarity > best_similarity) {
				best_similarity = similarity;
				best_match = tz;
			}
		});

		return best_match && best_similarity > this.#similarity_threshold ? { tz: best_match, similarity: best_similarity } : null;
	}

	#calculateStringSimilarity(str1, str2) {
		str1 = str1.toLowerCase();
		str2 = str2.toLowerCase();

		if (str1 === str2) return 1;

		const len1 = str1.length;
		const len2 = str2.length;
		const max_len = Math.max(len1, len2); // QMath.max/min
		const min_len = Math.min(len1, len2);

		let matching_chars = 0;
		let pos_score = 0;

		for (let i = 0; i < max_len; i++) {
			if (str1[i] === str2[i]) {
				matching_chars++;
				pos_score += (max_len - i) / max_len; // give more weight to earlier pos
			}
		}

		const char_ratio = matching_chars / max_len;
		const len_ratio = min_len / max_len;

		// prioritize matching characters for shorter strings
		const char_weight = 0.8 + (0.15 * (1 - len_ratio)); // ++ more for shorter strings
		const pos_weight = 0.2 - (0.15 * (1 - len_ratio)); // -- for shorter strings

		const similarity = (char_ratio * char_weight) + (pos_score * pos_weight);

		return similarity;
	}

	#isDstPeriod(date, dst_rule) {
		debugLog(3, `isDstPeriod called with date: ${date.toISOString()} and dst_rule: ${dst_rule}`);

		const cache = `${date.getTime()}_${dst_rule}`;
		if (this.#dst_cache.has(cache)) {
			debugLog(3, `Returning cached result for ${cache}`);
			return this.#dst_cache.get(cache);
		}

		if (dst_rule === "00") {
			debugLog(3, "No DST rule, returning false");
			return false; // no DST
		}

		const year = date.getFullYear();
		const rule = parseInt(dst_rule, 16);
		debugLog(3, `Year: ${year}, Rule (hex): ${dst_rule}, Rule (decimal): ${rule}`);

		// extract dst rule info
		const start_month = (rule & 0x0F);
		const start_week = ((rule >> 4) & 0x07);
		const end_month = ((rule >> 8) & 0x0F);
		const end_week = ((rule >> 12) & 0x07);
		debugLog(3, `Start month: ${start_month}, Start week: ${start_week}, End month: ${end_month}, End week: ${end_week}`);

		// find start/end dates
		const start_day = this.#nthWeekdayOfMonth(year, start_month, 0, start_week);
		const end_day = this.#nthWeekdayOfMonth(year, end_month, 0, end_week);
		debugLog(3, `Start day: ${start_day}, End day: ${end_day}`);

		const start = new Date(Date.UTC(year, start_month - 1, start_day, 2));  // 2 AM
		const end = new Date(Date.UTC(year, end_month - 1, end_day, 2));     // 2 AM
		debugLog(3, `DST start: ${start.toISOString()}, DST end: ${end.toISOString()}`);

		// convert input date to UTC
		const utc_date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));
		debugLog(3, `UTC Date: ${utc_date.toISOString()}`);

		// check if the date is within the DST period
		let result;
		if (start <= end) {
			result = utc_date >= start && utc_date < end;
			debugLog(3, `Normal hemisphere case: ${result}`);
		} else {
			// handle southern hemisphere case
			result = utc_date >= start || utc_date < end;
			debugLog(3, `Southern hemisphere case: ${result}`);
		}

		debugLog(3, `Final DST result: ${result}`);
		this.#dst_cache.set(cache, result);

		return result;
	}

	#nthWeekdayOfMonth(year, month, weekday, n) {
		debugLog(3, `nthWeekdayOfMonth called with year: ${year}, month: ${month}, weekday: ${weekday}, n: ${n}`);

		const cache = `${year}_${month}_${weekday}_${n}`;
		if (this.#nth_week_cache.has(cache)) {
			return this.#nth_week_cache.get(cache);
		}

		const date = new Date(Date.UTC(year, month - 1, 1));
		const day = date.getUTCDay();

		if (n === 0) {
			const diff = (weekday - day + 7) % 7;
			date.setUTCDate(1 + diff);
		} else {
			const diff = weekday - day;
			date.setUTCDate(1 + diff + (diff < 0 ? 7 : 0) + (n - 1) * 7);
		}

		debugLog(3, `Calculated date: ${date.toISOString()}`);

		if (date.getUTCMonth() !== month - 1) {
			date.setUTCDate(date.getUTCDate() - 7);
			debugLog(3, `Adjusted date (moved back a week): ${date.toISOString()}`);
		}

		const result = date.getUTCDate();
		debugLog(3, `Returning day of month: ${date.getUTCDate()}`);

		this.#nth_week_cache.set(cache, result);

		return result;
	}

	#offset2str(tz_offset) {
		const ttl_mins = Math.abs(tz_offset);
		const h = Math.floor(ttl_mins / 60);
		const m = ttl_mins % 60;
		const sign = tz_offset >= 0 ? '+' : '-';

		return `${sign}${pad(h, 2)}:${pad(m, 2)}`;
	}

	#applyOffsetToDate(date, offset_mins) {
		const utc_time = date.getTime() + date.getTimezoneOffset() * 60000;
		return new Date(utc_time + offset_mins * 60000);
	}

	#formatDateWithOffset(date, offset_mins) {
		const sign = offset_mins >= 0 ? '+' : '-';
		const abs_offset = Math.abs(offset_mins);
		const h = Math.floor(abs_offset / 60).toString().padStart(2, '0');
		const m = (abs_offset % 60).toString().padStart(2, '0');
		return `${date.toISOString().slice(0, 19)}${sign}${h}:${m}`;
	}

	#str2offset(offset_str) {
		if (this.#offset_cache.has(offset_str)) {
			return this.#offset_cache.get(offset_str);
		}

		let parts;
		if (offset_str.includes(':')) {
			parts = offset_str.split(':');
		} else {
			parts = [offset_str, '00'];
		}
		const h = parseInt(parts[0].replace(/[+-]/, ''), 10);
		const m = parseInt(parts[1], 10) || 0;
		const ttl_offset = h * 60 + m;

		const result = offset_str.startsWith('-') ? -ttl_offset : ttl_offset

		this.#offset_cache.set(offset_str, result);

		return result;
	}
}

// HELPERS
function pad(num, len) {
	return num.toString().padStart(len, '0');
}


/**
DST rule "dst_rule":
- Handles both northern and southern hemisphere DST rules.
- Considers DST changes occurring at 2 AM.
- Handles the "last" week of the month when n is 0 in nthWeekdayOfMonth.
- Example for NY "dst_rule: B13" -> B13 (hex) = 1011 0001 0011 (bin)
	start month: 3 (March)
	start week: 2 (Second week)
	end month: 11 (November)
	end week: 1 (First week)
Output: New York (+ most of the US) where DST starts on the second Sunday in March
	and ends on the first Sunday in November.

+-------+-------+-------+-------+-------+
| Bits  | 15-12 | 11-8  |  7-4  |  3-0  |
+-------+-------+-------+-------+-------+
| Desc  | End   | End   | Start | Start |
|       | Week  | Month | Week  | Month |
+-------+-------+-------+-------+-------+
| Value |  1011 | 0001  | 0011  | 0011  |
|       |  (0)  | (11)  |  (1)  |  (3)  |
+-------+-------+-------+-------+-------+
*/