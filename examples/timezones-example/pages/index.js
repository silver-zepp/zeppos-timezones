import AutoGUI from "@silver-zepp/autogui";
import VisLog from "@silver-zepp/vis-log";
import { Timezones } from "../../../tz-npm/dist/tz-import.src";

const gui = new AutoGUI();
const vis = new VisLog();

// Enable unit test?
// - Timezones (14 tests)
// - GPS location (12 tests)
const RUN_UNIT_TEST = false;

// ===================================== //
// === SUPPORTED CONSTRUCTOR FORMATS === //
// ===================================== //
// 1. empty constructor -> use hardware/emulator built-in TZ
// 2. (int) -4  
// 3. (str) America/New_York | WrongCountry/WrongCity | Europe/London
// 4. (int str) "-5" 
// 5. (str) "+04:30"
// 6. (str) "CA" // country abbriviation for Canada
// 7. (str) "CST" // SDT | DST (lookup)
// =======================
const tz = new Timezones("America/New_York");
// =======================

function example_TimeTest() {
	gui.spacer();
	gui.newRow();

	const text_date = gui.text('');
	gui.newRow();

	const text_time_sensor_hour = gui.text('');
	gui.newRow();

	const text_js_date_hour = gui.text('');
	gui.newRow();

	const text_loca = gui.text('');
	gui.newRow();

	const text_dst = gui.text('');

	gui.newRow();
	gui.spacer();


	function updateTimeTexts() {
		// Timezones lib built-in methods
		const tz_date = tz.getDate(); // craft a Date object adjusted to your timezone
		const tz_hour = tz_date.getHours();
		const tz_mins = tz_date.getMinutes();

		// js watch/sim built-in methods
		const cur_date = new Date();
		const local_hour = cur_date.getHours();
		const local_mins = cur_date.getMinutes();

		const ts_time = `TZ (Shift): ${tz_hour}:${tz_mins < 10 ? '0' : ''}${tz_mins}`;
		const js_time = `JS (Local): ${local_hour}:${local_mins < 10 ? '0' : ''}${local_mins}`;
		vis.log("Built-in date and time: ", cur_date);

		text_time_sensor_hour.update({ text: ts_time });
		text_js_date_hour.update({ text: js_time });

		const { location, is_dst } = tz.getLocationAndDaylightStatus();

		const loca = `Location: ${location}`;
		const dst = `DST: ${is_dst}`;

		text_loca.update({ text: loca });
		text_dst.update({ text: dst });
		text_date.update({ text: tz_date, text_size: 20 });

		vis.log(`Date: ${tz_date}, ${ts_time} ${js_time} ${loca} ${dst}`);

		// print related info about a particular timezone
		const tz_info = tz.getTimezoneInfo("US");
		vis.log("TZ Info:", JSON.stringify(tz_info));

		// print approximate location based on GPS coordinates
		// 51.5072, 0.1276 = London
		const london = { lat: 51.5072, lon: 0.1276 };
		const ny = { lat: 40.7128, lon: -74.0060 };
		let approx_loca = tz.getApproxLocation(london.lat, london.lon);
		vis.log("GPS Approximate location:", approx_loca);

		// return a next dst change object that represents the time until the next DST change
		vis.log("Next DST change:", JSON.stringify(tz.getTimeUntilNextDstChange()));

		// pretty print the date for the next DST on/off change
		vis.log(tz.formatTimeUntilNextDstChange());

		// convert current time to Tokyo time
		vis.log("Time in Japan:", tz.convertToTimeZone(tz_date, 'Asia/Tokyo'));
	}

	gui.render();

	updateTimeTexts();
}

Page({
	build() {
		// set a simulated date
		// Timezones.SetCurrentDate(new Date('2024-06-15T12:00:00Z'));

		// 4H 1M before NY DST OFF (doesn't accoutn for current TZ shift)
		// Timezones.SetCurrentDate(new Date('2024-11-03T01:59:00Z')); 

		AutoGUI.SetColor(0x333333);
		example_TimeTest();

		let lines = 2;
		if (RUN_UNIT_TEST) {
			lines = 6;
			setTimeout(run_TimezoneTests, 500);
		}
		
		// if we dont run unit test - limit the amount of log lines to 2
		// otherwise expand it to 6 (default 5)
		vis.updateSettings({ line_count: lines });
	}

});

// ===== Timezone Test Cases ===== //
function run_TimezoneTests() {
	vis.log("\n===== Running: Timezone Test Cases =====\n ");

	const cases = [
		{ input: "America/New_York", expected: "America/New_York" },
		{ input: "WrongCountry/WrongCity", expected: "Unknown" },
		{ input: "Europe/London", expected: "Europe/London" },
		{ input: "Europe/WarZaw", expected: "Europe/Warsaw" }, // typo auto correction
		{ input: -4, expected: "America/Asuncion" },
		{ input: "-5", expected: "America/Bogota" },
		{ input: "+04:30", expected: "Asia/Kabul" },
		{ input: "UTC+3", expected: "Africa/Nairobi" },
		{ input: "", expected: "Africa/Abidjan" }, // use built-in TZ UTC+0
		{ input: "Asia/Tokyo", expected: "Asia/Tokyo" },
		{ input: "Australia/Sydney", expected: "Australia/Sydney" },
		{ input: "Pacific/Auckland", expected: "Pacific/Auckland" },
		{ input: "Africa/Cairo", expected: "Africa/Cairo" },
		{ input: "Europe/Paris", expected: "Europe/Paris" },
	];

	let passed = 0;
	let ttl_tests = cases.length;

	function runTest(index) {
		if (index >= cases.length) {
			vis.log(`Test Summary: ${passed} out of ${ttl_tests} tests passed.`);
			if (passed < ttl_tests) {
				vis.log(`Failed tests: ${cases.map((_, i) => i + 1).filter(i => cases[i].expected !== new Timezones(cases[i].input).getLocation()).join(', ')}`);
			}

			// start gps loca tests right after timezones
			setTimeout(run_GPSTests, 500);

			return;
		}

		const test = cases[index];
		const start = Date.now();
		const tz = new Timezones(test.input);
		const end = Date.now();

		const location = tz.getLocation();
		const time_taken = end - start;
		const { is_dst } = tz.getLocationAndDaylightStatus();

		vis.log(`Test ${index + 1}: Testing with input "${test.input}"`);
		vis.log(`  Time taken: ${time_taken}ms`);
		vis.log(`  Result: ${location}`);
		vis.log(`  Expected: ${test.expected}`);
		vis.log(`  Status: ${location === test.expected ? 'PASSED' : 'FAILED'}`);
		vis.log(`  Current time: ${tz.getTime()}`);
		vis.log(`  DST: ${is_dst}`);
		vis.log("--------------------");

		if (location === test.expected) {
			passed++;
		}

		setTimeout(function () {
			runTest(index + 1);
		}, 200);
	}

	runTest(0);
}

// ===== GPS Test Cases ===== //
function run_GPSTests() {
	vis.log("\n===== Running: GPS Test Cases =====\n ");

	const cases = [
		{ input: { lat: 51.5072, lon: 0.1276 }, expected: "Europe/London", name: "London" },
		{ input: { lat: 40.7128, lon: -74.0060 }, expected: "America/New_York", name: "New York" },
		{ input: { lat: 35.6762, lon: 139.6503 }, expected: "Asia/Tokyo", name: "Tokyo" },
		{ input: { lat: -33.8688, lon: 151.2093 }, expected: "Australia/Sydney", name: "Sydney" },
		{ input: { lat: 55.7558, lon: 37.6173 }, expected: "Europe/Moscow", name: "Moscow" },
		{ input: { lat: 25.2048, lon: 55.2708 }, expected: "Asia/Dubai", name: "Dubai" },
		{ input: { lat: 34.0522, lon: -118.2437 }, expected: "America/Los_Angeles", name: "Los Angeles" },
		{ input: { lat: 61.2181, lon: -149.9003 }, expected: "America/Anchorage", name: "Anchorage" },
		{ input: { lat: 48.8566, lon: 2.3522 }, expected: "Europe/Paris", name: "Paris" },
		{ input: { lat: 31.2304, lon: 121.4737 }, expected: "Asia/Shanghai", name: "Shanghai" },
		{ input: { lat: 19.4326, lon: -99.1332 }, expected: "America/Mexico_City", name: "Mexico City" },
		{ input: { lat: 1.3521, lon: 103.8198 }, expected: "Asia/Singapore", name: "Singapore" },
	];

	let passed = 0;
	let ttl_tests = cases.length;

	const tz = new Timezones();

	function runTest(index) {
		if (index >= cases.length) {
			vis.log(`Test Summary: ${passed} out of ${ttl_tests} tests passed.`);
			if (passed < ttl_tests) {
				vis.log(`Failed tests: ${cases.map((_, i) => i + 1).filter(i => {
					const test = cases[i];
					return tz.getApproxLocation(test.input.lat, test.input.lon) !== test.expected;
				}).join(', ')}`);
			}
			return;
		}

		const test = cases[index];
		const start = Date.now();
		const result = tz.getApproxLocation(test.input.lat, test.input.lon);
		const end = Date.now();

		const time_taken = end - start;

		vis.log(`Test ${index + 1}: Testing with input "${test.input.lat}, ${test.input.lon}" (${test.name})`);
		vis.log(`  Time taken: ${time_taken}ms`);
		vis.log(`  Result: ${result}`);
		vis.log(`  Expected: ${test.expected}`);
		vis.log(`  Status: ${result === test.expected ? 'PASSED' : 'FAILED'}`);
		vis.log("--------------------");

		if (result === test.expected) {
			passed++;
		}

		setTimeout(function () {
			runTest(index + 1);
		}, 200);
	}

	runTest(0);
}
