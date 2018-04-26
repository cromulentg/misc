"use strict";
var daysInMonth = function(month, year) {
    var days = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ][month];
    if (month === 1) {
        if ((year % 4) === 0) {
            if ((year % 100) !== 0 || (year % 400) === 0) days++;
        }
    }
    return days;
};

var dateOfRoshHashanah = function(year) {
    // Conway's algorithm
    var g = (year % 19) + 1;
    var r = (12 * g % 19);

    var n = Math.floor(year / 100) - Math.floor(year / 400) - 2;
    n += (765433 / 492480) * r;
    n += (year % 4) / 4;
    n -= (313 * year + 89081) / 98496;

    var guess = Math.floor(n);
    var frac = n - guess;

    var date = new Date(year, 8, guess);
    var day = date.getDay();

    var postpone = 0;

    if (day === 0 || day === 3 || day === 5) postpone = 1;
    else if (day === 1 && (frac * 25920) >= 23269 && r > 11) postpone = 1;
    else if (day === 2 && (frac * 2160) >= 1367 && r > 11) postpone = 2;

    return new Date(date.valueOf() + postpone * 24 * 60 * 60 * 1000);
};

var div = function(a, b) {
  return Math.floor(a / b);
}

var julianDayNumberForJulianDate = function(julianDate) {
  var y = julianDate.getUTCFullYear();
  var m = julianDate.getUTCMonth() + 1;
  var d = julianDate.getUTCDate();

  return 367 * y - div(7 * (y + 5001 + div(m - 9, 7)), 4) +
    div(275 * m, 9) + d + 1729777;
}

var julianDayNumberForGregorianDate = function(gregorianDate) {
  var y = gregorianDate.getUTCFullYear();
  var m = gregorianDate.getUTCMonth() + 1;
  var d = gregorianDate.getUTCDate();

  var janFeb = div(m - 14, 12); // 1-day offset for january / february

  return div(1461 * (y + 4800 + janFeb), 4) +
      div(367 * (m - 2 - 12 * janFeb), 12) -
      div(3 * div(y + 4900 + janFeb, 100), 4) + d - 32075;
}

var hijriDateForDate = function(yearOrDate, month, date) {
  var gregorian = (yearOrDate instanceof Date) ?
      Date.UTC(yearOrDate.getFullYear(), yearOrDate.getUTCMonth(), yearOrDate.getUTCDate()) :
      Date.UTC(yearOrDate, month, date);
  gregorian = new Date(gregorian);

  // July 16, 622 CE on the Julian calendar. Mohammed ascent?
  var hijriBase = new Date(Date.UTC(622, 6, 16));

  /* leap years are the 2nd, 5th, 7th, 10th, 13th, 16th, 18th, 21st, 24th, 26th and 29th
   * years in a 30-year cycle. */
  var leapCycleDays = (30 + 29) * 6 * 30 + 11; // days in 30 years
  var deltaDays = julianDayNumberForGregorianDate(gregorian) -
      julianDayNumberForJulianDate(hijriBase);
  var hijriCycles = Math.floor(deltaDays / leapCycleDays);
  deltaDays -= hijriCycles * leapCycleDays;
  var yearInCycle = 0;
  var daysInYear = (30 + 29) * 6;
  var leapYear = 0;
  while (deltaDays >= (daysInYear + leapYear)) {
    deltaDays -= (daysInYear + leapYear);
    yearInCycle++;
    leapYear = ([1, 4, 6, 9, 12, 15, 17, 20, 23, 25, 28].indexOf(yearInCycle) === -1) ? 0 : 1;
  }
  var month = 0;
  var daysInMonth = 30;
  while (deltaDays >= daysInMonth && month < 11) {
    deltaDays -= daysInMonth;
    month++;
    daysInMonth = 30 - (month & 1);
  }
  return [hijriCycles * 30 + yearInCycle + 1, month, deltaDays + 1];
}

var isRamadan = function(dateOrYear, month, day) {
  return hijriDateForDate(dateOrYear, month, day)[1] == 8;
}

var dateForDayInWeek = function(weekNumber, dayNumber, month, year) {
    if (weekNumber === 'last') {
        var totalDays = daysInMonth(month, year);
        var date = new Date(year, month, totalDays);
        date = date.getDate() - date.getDay() + dayNumber;
        return (date > totalDays) ? date - 7 : date;
    }

    var date = new Date(year, month, 1);
    date = date.getDate() - date.getDay() + dayNumber;
    if (date < 0) date += 7;
    return date + (weekNumber * 7);
};

/**
 * Generates functions that compute whether or not a date and time is DST-
 * shifted for time zones in the northern hemisphere.
 *
 * Most DST shifts world-wide are defined as the <x>'th <weekday> of <month>,
 * at a specific hour in either local time or UTC.
 *
 * protoNorthernRule takes 2 structures as arguments, defining the start
 * and end points of daylight savings time:
 *
 *  - month: the month (0-11, January-December) of the shift
 *  - week: which instance (<x'th>) of the weekday in the month. can be
 *          an integer 0-n for a specific instance, or the special value 'last'
 *          to use the last instance of the weekday
 *  - day: which day of the week (0-6, Sunday-Saturday) the shift occurs
 *  - hour: the hour that the shift occurs.
 *
 * For timezones where the shift hour is defined relative to UTC (like Europe),
 * set inUTC=true to adjust the shift hour to the local time.
 *
 * Returns a function that takes as arguments a time zone and a date and returns
 * true if the date is DST-shifted, false otherwise. The date may either be
 * a Javascript Date instance or a set of date components (year, month, date
 * hours, minutes). If components are provided, they are interpreted as
 * local to the time zone being checked. Date instances are interpreted as
 * absolute timestamps in UTC.
 */
var protoNorthernRule = function(localStart, localEnd, inUTC) {
    return function(zone, yearOrDate, month, date, hours, mins) {
        var year = yearOrDate;

        hours = hours || 0;
        mins = mins || 0;

        if (yearOrDate instanceof Date) {
            /* rather than dealing with the vagaries of the local machine's
             * timezone and DST shifts, just fudge the UTC value so that the
             * values are corrected for the target time zone */
            var std = new Date(yearOrDate.valueOf() + zone.std * 60 * 1000);
            year = std.getUTCFullYear();
            month = std.getUTCMonth();
            date = std.getUTCDate();
            hours = std.getUTCHours();
            mins = std.getUTCMinutes();
        }

        if (month < localStart.month || month > localEnd.month) return false;
        if (month > localStart.month && month < localEnd.month) return true;

        if (month === localStart.month) {
            var start = dateForDayInWeek(localStart.week, localStart.day,
                                         localStart.month, year);
            var startTime = localStart.hour * 60;
            if (inUTC) startTime += zone.std;
            return date > start ||
                (date === start && (hours * 60 + mins >= startTime));
        }

      /* convert the date object into components again, applying the DST
       * offset, so it can be compared against the DST end time */
        if (yearOrDate instanceof Date) {
            var dst = new Date(yearOrDate.valueOf() + zone.dst * 60 * 1000);
            month = dst.getUTCMonth();
            if (month < localEnd.month) return true;
            if (month > localEnd.month) return false;
            date = dst.getUTCDate();
            hours = dst.getUTCHours();
            year = dst.getUTCFullYear();
            mins = dst.getUTCMinutes();
        }

        var end = dateForDayInWeek(localEnd.week, localEnd.day,
                                   localEnd.month, year);
        var endTime = localEnd.hour * 60;
        if (inUTC) endTime += zone.dst;

        return date < end ||
            (date === end && (hours * 60 + mins < endTime));
    };
};

/**
 * Generic rule for the southern hemisphere, called identically to
 * protoNorthernRule. separate because daylight savings time spans
 * years (ie, the end month is < the start month)
 */
var protoSouthernRule = function(localStart, localEnd, inUTC) {
    return function(zone, yearOrDate, month, date, hours, mins) {
        var year = yearOrDate;

        if (yearOrDate instanceof Date) {
            var std = new Date(yearOrDate.valueOf() + zone.std * 60 * 1000);
            year = std.getUTCFullYear();
            month = std.getUTCMonth();
            date = std.getUTCDate();
            hours = std.getUTCHours();
            mins = std.getUTCMinutes();
        }

        if (month < localEnd.month || month > localStart.month) return true;
        if (month > localEnd.month && month < localStart.month) return false;

        if (month === localEnd.month) {
            if (yearOrDate instanceof Date) {
                var dst = new Date(yearOrDate.valueOf + zone.dst * 60 * 1000);
                year = dst.getUTCFullYear();
                month = dst.getUTCMonth();
                date = dst.getUTCDate();
                hours = dst.getUTCHours();
                mins = dst.getUTCMinutes();
                if (month < localEnd.month) return true;
                if (month > localEnd.month) return false;
            }
            var end = dateForDayInWeek(localEnd.week, localEnd.day,
                                       localEnd.month, year);
            var endTime = localEnd.hour * 60;
            if (inUTC) endTime += zone.dst;
            return date < end ||
                (date === end && (hours * 60 + mins < endTime));
        }

        var start = dateForDayInWeek(localStart.week, localStart.day,
                                     localStart.month, year);
        var startTime = localStart.hour * 60;
        if (inUTC) startTime += zone.std;
        return date > start ||
            (date === start && (hours * 60 + mins >= startTime));
    };
};

/**
 * Israel (and Palestine) are just like the northern hemisphere, except
 * that the start date is the Friday before the last Sunday. This requires
 * special handling, since it isn't a specific Friday (it will either be
 * the last or second-to-last Friday).
 */
var protoIsraelRule = function(startHour, endHour) {
    return function(zone, yearOrDate, month, date, hours, mins) {
        var year = yearOrDate;

        if (yearOrDate instanceof Date) {
            var std = new Date(yearOrDate.valueOf() + zone.std * 60 * 1000);
            year = std.getUTCFullYear();
            month = std.getUTCMonth();
            date = std.getUTCDate();
            hours = std.getUTCHours();
            mins = std.getUTCMinutes();
        }

        if (month < 2 || month > 9) return false;
        if (month > 2 && month < 9) return true;

        if (month === 2) {
            var start = dateForDayInWeek('last', 0, 2, year);
            start -= 2; // Friday before the last Sunday in March
            var startTime = startHour * 60;
            return date > start ||
                (date === start && (hours * 60 + mins >= startTime));
        }
        if (yearOrDate instanceof Date) {
            var dst = new Date(yearOrDate.valueOf() + zone.dst * 60 * 1000);
            year = dst.getUTCFullYear();
            month = dst.getUTCMonth();
            date = dst.getUTCDate();
            hours = dst.getUTCHours();
            mins = dst.getUTCMinutes();
            if (month < 9) return true;
            if (month > 9) return false;

            var end = dateForDayInWeek('last', 0, 9, year);
            var endTime = endHour * 60;
            return date < end ||
                (date === end && (hours * 60 + mins < endTime));
        }
    };
};

var dstRules = {
    US: protoNorthernRule({ month: 2, week: 1, day: 0, hour:2 },
                          { month: 10, week: 0, day: 0, hour:2 }),
    Cuba: protoNorthernRule({ month: 2, week: 1, day: 0, hour: 0 },
                            { month: 10, week: 0, day: 0, hour: 1 }),
    Europe: protoNorthernRule({ month: 2, week: 'last', day: 0, hour:1 },
                              { month: 9, week: 'last', day: 0, hour:1 }, true),
    Jordan: protoNorthernRule({ month: 2, week: 'last', day: 5, hour: 0 },
                              { month: 9, week: 'last', day: 5, hour: 1 }),
    Syria: protoNorthernRule({ month: 2, week: 'last', day: 5, hour: 0 },
                             { month: 9, week: 'last', day: 5, hour: 0 }),
    Lebanon: protoNorthernRule({ month: 2, week: 'last', day: 0, hour: 0 },
                               { month: 9, week: 'last', day: 0, hour: 0 }),
    Mexico: protoNorthernRule({ month: 3, week: 0, day: 0, hour:2 },
                              { month: 9, week: 'last', day: 0, hour:2 }),
    Fiji: protoSouthernRule({ month: 9, week: 2, day: 0, hour: 2 },
                            { month: 0, week: 2, day: 0, hour: 3 }),
    Namibia: protoSouthernRule({ month: 8, week: 0, day: 0, hour:2 },
                               { month: 3, week: 0, day: 0, hour:2 }),
    NZ: protoSouthernRule({ month: 8, week: 'last', day: 0, hour:2 },
                          { month: 3, week: 0, day: 0, hour:3 }),
    Australia: protoSouthernRule({ month: 9, week: 0, day: 0, hour:2 },
                                 { month: 3, week: 0, day: 0, hour:3 }),
    Brazil: protoSouthernRule({ month: 9, week: 2, day: 0, hour:0 },
                              { month: 1, week: 2, day: 0, hour:0 }),
    Uruguay: protoSouthernRule({ month: 9, week: 0, day: 0, hour:2 },
                               { month: 2, week: 1, day: 0, hour:2 }),
    Chile: protoSouthernRule({ month: 8, week: 1, day: 0, hour:0 },
                             { month: 3, week: 'last', day: 0, hour:0 }),
    Palmer: protoSouthernRule({ month: 8, week: 0, day: 0, hour: 0 },
                              { month: 3, week: 'last', day: 0, hour: 0 }),
    Israel: protoIsraelRule(2, 2),
    Palestine: protoIsraelRule(12, 1),
    EuropeExRamadan: function() {
      return dstRules.Europe.apply(null, arguments) && !isRamadan.apply(null, arguments);
    },
    Iran: function(zone, yearOrDate, month, date) {
        // Approximate, should be 1 Farvadin - 1 Mehr on Islamic calendar
        if (yearOrDate instanceof Date) {
            var std = new Date(yearOrDate.valueOf() + zone.std * 60 * 1000);
            month = std.getUTCMonth();
            date = std.getUTCDate();
        }

        if (month < 2 || month > 8) return false;
        if (month > 2 && month < 8) return true;

        if (month === 2) return date >= 21;

        if (yearOrDate instanceof Date) {
            var dst = new Date(yearOrDate.valueOf() + zone.dst * 60 * 1000);
            month = dst.getUTCMonth();
            date = dst.getUTCDate();
        }
        if (month < 8) return true;
        if (month > 8) return false;
        return date < 23;
    },
    Sahara: function() {
        // too difficult to deal with properly
        return false;
    }
};

var abbrToName = {
    'tz_000': 'Atlantic/Canary',
    'tz_001': 'Australia/Melbourne',
    'tz_002': 'Europe/Minsk',
    'tz_003': 'America/Nipigon',
    'tz_004': 'America/Miquelon',
    'tz_005': 'Pacific/Wallis',
    'tz_006': 'Antarctica/Davis',
    'tz_007': 'Asia/Dhaka',
    'tz_008': 'America/St_Lucia',
    'tz_009': 'Asia/Kashgar',
    'tz_010': 'America/Phoenix',
    'tz_011': 'Asia/Kuwait',
    'tz_012': 'America/Mazatlan',
    'tz_013': 'Arctic/Longyearbyen',
    'tz_014': 'Europe/Guernsey',
    'tz_015': 'Antarctica/Rothera',
    'tz_016': 'Europe/Stockholm',
    'tz_017': 'Pacific/Fiji',
    'tz_018': 'Pacific/Apia',
    'tz_019': 'Pacific/Pago_Pago',
    'tz_020': 'Asia/Rangoon',
    'tz_021': 'America/Mexico_City',
    'tz_022': 'America/Puerto_Rico',
    'tz_023': 'Indian/Mauritius',
    'tz_024': 'Europe/Berlin',
    'tz_025': 'Europe/Zurich',
    'tz_026': 'Africa/Casablanca',
    'tz_027': 'Antarctica/Macquarie',
    'tz_028': 'Europe/Warsaw',
    'tz_029': 'Asia/Krasnoyarsk',
    'tz_030': 'Atlantic/Bermuda',
    'tz_031': 'America/Araguaina',
    'tz_032': 'Asia/Tehran',
    'tz_033': 'Asia/Baku',
    'tz_034': 'America/St_Barthelemy',
    'tz_035': 'America/Santarem',
    'tz_036': 'America/Danmarkshavn',
    'tz_037': 'America/Scoresbysund',
    'tz_038': 'America/Eirunepe',
    'tz_039': 'America/Caracas',
    'tz_040': 'Asia/Baghdad',
    'tz_041': 'Africa/Monrovia',
    'tz_042': 'America/St_Vincent',
    'tz_043': 'America/Vancouver',
    'tz_044': 'Asia/Ho_Chi_Minh',
    'tz_045': 'Europe/Busingen',
    'tz_046': 'Asia/Thimphu',
    'tz_047': 'Africa/Accra',
    'tz_048': 'America/Belize',
    'tz_049': 'America/Port_of_Spain',
    'tz_050': 'Asia/Tashkent',
    'tz_051': 'Asia/Tokyo',
    'tz_052': 'Pacific/Kiritimati',
    'tz_053': 'Australia/Sydney',
    'tz_054': 'Europe/Riga',
    'tz_055': 'Asia/Dili',
    'tz_056': 'Africa/Mbabane',
    'tz_057': 'Asia/Oral',
    'tz_058': 'Asia/Aden',
    'tz_059': 'Europe/Isle_of_Man',
    'tz_060': 'Europe/Istanbul',
    'tz_061': 'Asia/Magadan',
    'tz_062': 'Australia/Lindeman',
    'tz_063': 'Pacific/Galapagos',
    'tz_064': 'America/Bogota',
    'tz_065': 'Africa/Asmara',
    'tz_066': 'America/Chicago',
    'tz_067': 'Pacific/Kwajalein',
    'tz_068': 'Australia/Broken_Hill',
    'tz_069': 'America/Cuiaba',
    'tz_070': 'Indian/Christmas',
    'tz_071': 'Asia/Jayapura',
    'tz_072': 'Europe/Brussels',
    'tz_073': 'Europe/Lisbon',
    'tz_074': 'Asia/Chongqing',
    'tz_075': 'America/Argentina/Cordoba',
    'tz_076': 'America/Noronha',
    'tz_077': 'Europe/Podgorica',
    'tz_078': 'Africa/Algiers',
    'tz_079': 'Africa/Harare',
    'tz_080': 'Africa/Ndjamena',
    'tz_081': 'America/Costa_Rica',
    'tz_082': 'Europe/Ljubljana',
    'tz_083': 'Indian/Mayotte',
    'tz_084': 'Asia/Phnom_Penh',
    'tz_085': 'America/Managua',
    'tz_086': 'America/Pangnirtung',
    'tz_087': 'America/Tijuana',
    'tz_088': 'Pacific/Fakaofo',
    'tz_089': 'America/Martinique',
    'tz_090': 'America/Antigua',
    'tz_091': 'America/Indiana/Indianapolis',
    'tz_092': 'America/Argentina/La_Rioja',
    'tz_093': 'Pacific/Tahiti',
    'tz_094': 'Asia/Brunei',
    'tz_095': 'Europe/Zagreb',
    'tz_096': 'America/Asuncion',
    'tz_097': 'Europe/Vienna',
    'tz_098': 'Australia/Hobart',
    'tz_099': 'America/Juneau',
    'tz_100': 'America/Inuvik',
    'tz_101': 'America/Ojinaga',
    'tz_102': 'Asia/Seoul',
    'tz_103': 'Indian/Comoro',
    'tz_104': 'Europe/Paris',
    'tz_105': 'Europe/Tallinn',
    'tz_106': 'Indian/Mahe',
    'tz_107': 'America/Argentina/Jujuy',
    'tz_108': 'America/Creston',
    'tz_109': 'America/Adak',
    'tz_110': 'Asia/Singapore',
    'tz_111': 'Africa/Nairobi',
    'tz_112': 'America/Maceio',
    'tz_113': 'Africa/Cairo',
    'tz_114': 'Europe/Moscow',
    'tz_115': 'Antarctica/Palmer',
    'tz_116': 'Asia/Ulaanbaatar',
    'tz_117': 'America/Rainy_River',
    'tz_118': 'Africa/Kampala',
    'tz_119': 'Asia/Colombo',
    'tz_120': 'Australia/Adelaide',
    'tz_121': 'America/Cambridge_Bay',
    'tz_122': 'Africa/Luanda',
    'tz_123': 'Pacific/Chatham',
    'tz_124': 'America/Indiana/Winamac',
    'tz_125': 'Asia/Tbilisi',
    'tz_126': 'Europe/Gibraltar',
    'tz_127': 'Asia/Karachi',
    'tz_128': 'Asia/Harbin',
    'tz_129': 'Australia/Lord_Howe',
    'tz_130': 'America/Bahia_Banderas',
    'tz_131': 'America/Boa_Vista',
    'tz_132': 'America/Lima',
    'tz_133': 'Indian/Reunion',
    'tz_134': 'Atlantic/Stanley',
    'tz_135': 'America/Blanc-Sablon',
    'tz_136': 'Antarctica/Syowa',
    'tz_137': 'America/Jamaica',
    'tz_138': 'Europe/Kiev',
    'tz_139': 'Europe/Budapest',
    'tz_140': 'Pacific/Midway',
    'tz_141': 'America/Goose_Bay',
    'tz_142': 'Asia/Amman',
    'tz_143': 'Asia/Sakhalin',
    'tz_144': 'Africa/Windhoek',
    'tz_145': 'America/Sitka',
    'tz_146': 'America/Guyana',
    'tz_147': 'Pacific/Pohnpei',
    'tz_148': 'America/Sao_Paulo',
    'tz_149': 'America/Lower_Princes',
    'tz_150': 'Australia/Perth',
    'tz_151': 'Africa/Djibouti',
    'tz_152': 'Asia/Jakarta',
    'tz_153': 'Asia/Pyongyang',
    'tz_154': 'Africa/Johannesburg',
    'tz_155': 'Asia/Irkutsk',
    'tz_156': 'Africa/Niamey',
    'tz_157': 'America/Belem',
    'tz_158': 'America/Indiana/Marengo',
    'tz_159': 'Africa/Nouakchott',
    'tz_160': 'Europe/Vilnius',
    'tz_161': 'America/Cayenne',
    'tz_162': 'Africa/Mogadishu',
    'tz_163': 'America/Kentucky/Monticello',
    'tz_164': 'America/Rio_Branco',
    'tz_165': 'America/Cancun',
    'tz_166': 'America/Havana',
    'tz_167': 'Pacific/Guam',
    'tz_168': 'Pacific/Kosrae',
    'tz_169': 'Atlantic/Azores',
    'tz_170': 'Australia/Eucla',
    'tz_171': 'Asia/Shanghai',
    'tz_172': 'America/Godthab',
    'tz_173': 'Asia/Beirut',
    'tz_174': 'Africa/Maputo',
    'tz_175': 'Asia/Bahrain',
    'tz_176': 'Asia/Ashgabat',
    'tz_177': 'Asia/Riyadh',
    'tz_178': 'Europe/London',
    'tz_179': 'America/Montevideo',
    'tz_180': 'America/Anguilla',
    'tz_181': 'Asia/Damascus',
    'tz_182': 'America/North_Dakota/Center',
    'tz_183': 'America/Indiana/Vevay',
    'tz_184': 'Atlantic/St_Helena',
    'tz_185': 'America/Barbados',
    'tz_186': 'Europe/Vatican',
    'tz_187': 'America/Indiana/Vincennes',
    'tz_188': 'Asia/Almaty',
    'tz_189': 'America/Santo_Domingo',
    'tz_190': 'Africa/Brazzaville',
    'tz_191': 'America/Nome',
    'tz_192': 'Asia/Taipei',
    'tz_193': 'America/Yakutat',
    'tz_194': 'America/Argentina/Mendoza',
    'tz_195': 'Australia/Currie',
    'tz_196': 'Europe/Vaduz',
    'tz_197': 'Antarctica/Mawson',
    'tz_198': 'Asia/Kolkata',
    'tz_199': 'Africa/Maseru',
    'tz_200': 'America/Atikokan',
    'tz_201': 'America/Santa_Isabel',
    'tz_202': 'Asia/Kuching',
    'tz_203': 'Africa/Libreville',
    'tz_204': 'Africa/Freetown',
    'tz_205': 'Africa/Bissau',
    'tz_206': 'Europe/Samara',
    'tz_207': 'Europe/Amsterdam',
    'tz_208': 'Europe/Tirane',
    'tz_209': 'Pacific/Saipan',
    'tz_210': 'Africa/Abidjan',
    'tz_211': 'Europe/Zaporozhye',
    'tz_212': 'America/El_Salvador',
    'tz_213': 'Europe/Madrid',
    'tz_214': 'Africa/Juba',
    'tz_215': 'America/Santiago',
    'tz_216': 'America/Argentina/Buenos_Aires',
    'tz_217': 'America/Argentina/San_Luis',
    'tz_218': 'Europe/Skopje',
    'tz_219': 'America/Aruba',
    'tz_220': 'America/Regina',
    'tz_221': 'Pacific/Chuuk',
    'tz_222': 'Asia/Khandyga',
    'tz_223': 'Pacific/Funafuti',
    'tz_224': 'America/Merida',
    'tz_225': 'America/Guatemala',
    'tz_226': 'Africa/Sao_Tome',
    'tz_227': 'Asia/Makassar',
    'tz_228': 'Africa/Bujumbura',
    'tz_229': 'Europe/Chisinau',
    'tz_230': 'America/Monterrey',
    'tz_231': 'Asia/Yekaterinburg',
    'tz_232': 'Antarctica/Casey',
    'tz_233': 'Pacific/Enderbury',
    'tz_234': 'America/Thule',
    'tz_235': 'America/St_Johns',
    'tz_236': 'America/Moncton',
    'tz_237': 'Europe/Helsinki',
    'tz_238': 'Atlantic/Cape_Verde',
    'tz_239': 'America/Tegucigalpa',
    'tz_240': 'Indian/Cocos',
    'tz_241': 'America/Boise',
    'tz_242': 'America/Guadeloupe',
    'tz_243': 'America/Nassau',
    'tz_244': 'Europe/Prague',
    'tz_245': 'America/Halifax',
    'tz_246': 'Asia/Hovd',
    'tz_247': 'America/Manaus',
    'tz_248': 'America/Rankin_Inlet',
    'tz_249': 'America/North_Dakota/Beulah',
    'tz_250': 'America/Chihuahua',
    'tz_251': 'America/Iqaluit',
    'tz_252': 'America/Argentina/Rio_Gallegos',
    'tz_253': 'Pacific/Gambier',
    'tz_254': 'Europe/Volgograd',
    'tz_255': 'Africa/Bamako',
    'tz_256': 'Asia/Novokuznetsk',
    'tz_257': 'Europe/Uzhgorod',
    'tz_258': 'Africa/Banjul',
    'tz_259': 'Asia/Aqtau',
    'tz_260': 'Pacific/Palau',
    'tz_261': 'Africa/Malabo',
    'tz_262': 'Atlantic/Madeira',
    'tz_263': 'Pacific/Noumea',
    'tz_264': 'Africa/Kinshasa',
    'tz_265': 'Europe/Malta',
    'tz_266': 'America/Argentina/Ushuaia',
    'tz_267': 'Asia/Bangkok',
    'tz_268': 'Pacific/Niue',
    'tz_269': 'Australia/Brisbane',
    'tz_270': 'America/Recife',
    'tz_271': 'Asia/Yerevan',
    'tz_272': 'America/La_Paz',
    'tz_273': 'Asia/Urumqi',
    'tz_274': 'Africa/Lusaka',
    'tz_275': 'Pacific/Guadalcanal',
    'tz_276': 'America/Yellowknife',
    'tz_277': 'Asia/Vientiane',
    'tz_278': 'Europe/Kaliningrad',
    'tz_279': 'Africa/Conakry',
    'tz_280': 'America/Argentina/Tucuman',
    'tz_281': 'Europe/Oslo',
    'tz_282': 'America/St_Kitts',
    'tz_283': 'America/Panama',
    'tz_284': 'Africa/Gaborone',
    'tz_285': 'Asia/Hebron',
    'tz_286': 'America/Guayaquil',
    'tz_287': 'Asia/Kuala_Lumpur',
    'tz_288': 'America/Menominee',
    'tz_289': 'Asia/Kamchatka',
    'tz_290': 'Asia/Vladivostok',
    'tz_291': 'America/Matamoros',
    'tz_292': 'Asia/Qatar',
    'tz_293': 'Asia/Dubai',
    'tz_294': 'Asia/Yakutsk',
    'tz_295': 'Asia/Omsk',
    'tz_296': 'Africa/Bangui',
    'tz_297': 'UTC',
    'tz_298': 'America/Paramaribo',
    'tz_299': 'Africa/Lubumbashi',
    'tz_300': 'Pacific/Marquesas',
    'tz_301': 'Europe/Bratislava',
    'tz_302': 'Asia/Anadyr',
    'tz_303': 'America/New_York',
    'tz_304': 'Pacific/Norfolk',
    'tz_305': 'Pacific/Rarotonga',
    'tz_306': 'America/Dominica',
    'tz_307': 'Africa/Porto-Novo',
    'tz_308': 'Asia/Samarkand',
    'tz_309': 'Asia/Dushanbe',
    'tz_310': 'America/Kentucky/Louisville',
    'tz_311': 'America/Toronto',
    'tz_312': 'America/Bahia',
    'tz_313': 'Indian/Maldives',
    'tz_314': 'Africa/Ouagadougou',
    'tz_315': 'Asia/Muscat',
    'tz_316': 'America/Edmonton',
    'tz_317': 'Pacific/Wake',
    'tz_318': 'America/Indiana/Tell_City',
    'tz_319': 'Australia/Darwin',
    'tz_320': 'America/Whitehorse',
    'tz_321': 'America/Swift_Current',
    'tz_322': 'Europe/Copenhagen',
    'tz_323': 'America/Argentina/Salta',
    'tz_324': 'America/Montserrat',
    'tz_325': 'Europe/Simferopol',
    'tz_326': 'Africa/Blantyre',
    'tz_327': 'America/Detroit',
    'tz_328': 'America/Grenada',
    'tz_329': 'Atlantic/Faroe',
    'tz_330': 'America/Indiana/Petersburg',
    'tz_331': 'Asia/Kathmandu',
    'tz_332': 'Asia/Pontianak',
    'tz_333': 'Europe/Athens',
    'tz_334': 'America/Port-au-Prince',
    'tz_335': 'America/Cayman',
    'tz_336': 'Africa/Dar_es_Salaam',
    'tz_337': 'America/Curacao',
    'tz_338': 'Indian/Kerguelen',
    'tz_339': 'Africa/Khartoum',
    'tz_340': 'Asia/Manila',
    'tz_341': 'Africa/Lome',
    'tz_342': 'Africa/Douala',
    'tz_343': 'Europe/Rome',
    'tz_344': 'America/Argentina/San_Juan',
    'tz_345': 'America/North_Dakota/New_Salem',
    'tz_346': 'America/Kralendijk',
    'tz_347': 'Pacific/Port_Moresby',
    'tz_348': 'Europe/Jersey',
    'tz_349': 'Europe/Andorra',
    'tz_350': 'Europe/Luxembourg',
    'tz_351': 'Pacific/Honolulu',
    'tz_352': 'America/St_Thomas',
    'tz_353': 'Pacific/Majuro',
    'tz_354': 'Asia/Hong_Kong',
    'tz_355': 'Asia/Macau',
    'tz_356': 'Europe/Belgrade',
    'tz_357': 'Asia/Choibalsan',
    'tz_358': 'Europe/Mariehamn',
    'tz_359': 'Antarctica/McMurdo',
    'tz_360': 'America/Thunder_Bay',
    'tz_361': 'America/Los_Angeles',
    'tz_362': 'Asia/Kabul',
    'tz_363': 'Indian/Antananarivo',
    'tz_364': 'Europe/Sarajevo',
    'tz_365': 'Atlantic/Reykjavik',
    'tz_366': 'Asia/Nicosia',
    'tz_367': 'Pacific/Tongatapu',
    'tz_368': 'America/Marigot',
    'tz_369': 'Pacific/Pitcairn',
    'tz_370': 'Pacific/Easter',
    'tz_371': 'Atlantic/South_Georgia',
    'tz_372': 'Africa/El_Aaiun',
    'tz_373': 'Europe/Dublin',
    'tz_374': 'America/Dawson_Creek',
    'tz_375': 'Antarctica/Vostok',
    'tz_376': 'Europe/Bucharest',
    'tz_377': 'America/Porto_Velho',
    'tz_378': 'Europe/Monaco',
    'tz_379': 'Asia/Bishkek',
    'tz_380': 'Africa/Ceuta',
    'tz_381': 'America/Winnipeg',
    'tz_382': 'Asia/Aqtobe',
    'tz_383': 'Africa/Dakar',
    'tz_384': 'America/Fortaleza',
    'tz_385': 'Pacific/Tarawa',
    'tz_386': 'America/Dawson',
    'tz_387': 'Africa/Addis_Ababa',
    'tz_388': 'Pacific/Efate',
    'tz_389': 'Pacific/Johnston',
    'tz_390': 'GMT',
    'tz_391': 'America/Campo_Grande',
    'tz_392': 'Asia/Qyzylorda',
    'tz_393': 'Europe/San_Marino',
    'tz_394': 'Asia/Jerusalem',
    'tz_395': 'Pacific/Auckland',
    'tz_396': 'America/Metlakatla',
    'tz_397': 'America/Tortola',
    'tz_398': 'America/Denver',
    'tz_399': 'Indian/Chagos',
    'tz_400': 'America/Glace_Bay',
    'tz_401': 'America/Hermosillo',
    'tz_402': 'Africa/Tunis',
    'tz_403': 'Asia/Ust-Nera',
    'tz_404': 'America/Resolute',
    'tz_405': 'Asia/Gaza',
    'tz_406': 'Antarctica/DumontDUrville',
    'tz_407': 'America/Argentina/Catamarca',
    'tz_408': 'America/Indiana/Knox',
    'tz_409': 'Asia/Novosibirsk',
    'tz_410': 'Africa/Kigali',
    'tz_411': 'America/Grand_Turk',
    'tz_412': 'Africa/Lagos',
    'tz_413': 'Europe/Sofia',
    'tz_414': 'Africa/Tripoli',
    'tz_415': 'America/Anchorage',
    'tz_416': 'Pacific/Nauru'
};

var nameToAbbr = (function(dict) {
    var result = { };
    for (var key in dict) result[dict[key]] = key;
    return result;
})(abbrToName);

var timeZones = {
    'UTC': { 'dst': 0, 'std': 0 },
    'GMT': { 'dst': 0, 'std': 0 },
    'Africa/Abidjan': {'dst': 0, 'std': 0},
    'Africa/Accra': {'dst': 0, 'std': 0},
    'Africa/Addis_Ababa': {'dst': 180, 'std': 180},
    'Africa/Algiers': {'dst': 60, 'std': 60},
    'Africa/Asmara': {'dst': 180, 'std': 180},
    'Africa/Bamako': {'dst': 0, 'std': 0},
    'Africa/Bangui': {'dst': 60, 'std': 60},
    'Africa/Banjul': {'dst': 0, 'std': 0},
    'Africa/Bissau': {'dst': 0, 'std': 0},
    'Africa/Blantyre': {'dst': 120, 'std': 120},
    'Africa/Brazzaville': {'dst': 60, 'std': 60},
    'Africa/Bujumbura': {'dst': 120, 'std': 120},
    'Africa/Cairo': {'dst': 120, 'std': 120},
    'Africa/Casablanca': {'dst': 60, 'std': 0, 'rule': 'EuropeExRamadan'},
    'Africa/Ceuta': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Africa/Conakry': {'dst': 0, 'std': 0},
    'Africa/Dakar': {'dst': 0, 'std': 0},
    'Africa/Dar_es_Salaam': {'dst': 180, 'std': 180},
    'Africa/Djibouti': {'dst': 180, 'std': 180},
    'Africa/Douala': {'dst': 60, 'std': 60},
    'Africa/El_Aaiun': {'dst': 60, 'std': 0, 'rule': 'Sahara'},
    'Africa/Freetown': {'dst': 0, 'std': 0},
    'Africa/Gaborone': {'dst': 120, 'std': 120},
    'Africa/Harare': {'dst': 120, 'std': 120},
    'Africa/Johannesburg': {'dst': 120, 'std': 120},
    'Africa/Juba': {'dst': 180, 'std': 180},
    'Africa/Kampala': {'dst': 180, 'std': 180},
    'Africa/Khartoum': {'dst': 180, 'std': 180},
    'Africa/Kigali': {'dst': 120, 'std': 120},
    'Africa/Kinshasa': {'dst': 60, 'std': 60},
    'Africa/Lagos': {'dst': 60, 'std': 60},
    'Africa/Libreville': {'dst': 60, 'std': 60},
    'Africa/Lome': {'dst': 0, 'std': 0},
    'Africa/Luanda': {'dst': 60, 'std': 60},
    'Africa/Lubumbashi': {'dst': 120, 'std': 120},
    'Africa/Lusaka': {'dst': 120, 'std': 120},
    'Africa/Malabo': {'dst': 60, 'std': 60},
    'Africa/Maputo': {'dst': 120, 'std': 120},
    'Africa/Maseru': {'dst': 120, 'std': 120},
    'Africa/Mbabane': {'dst': 120, 'std': 120},
    'Africa/Mogadishu': {'dst': 180, 'std': 180},
    'Africa/Monrovia': {'dst': 0, 'std': 0},
    'Africa/Nairobi': {'dst': 180, 'std': 180},
    'Africa/Ndjamena': {'dst': 60, 'std': 60},
    'Africa/Niamey': {'dst': 60, 'std': 60},
    'Africa/Nouakchott': {'dst': 0, 'std': 0},
    'Africa/Ouagadougou': {'dst': 0, 'std': 0},
    'Africa/Porto-Novo': {'dst': 60, 'std': 60},
    'Africa/Sao_Tome': {'dst': 0, 'std': 0},
    'Africa/Tripoli': {'dst': 120, 'std': 120},
    'Africa/Tunis': {'dst': 60, 'std': 60},
    'Africa/Windhoek': {'dst': 120, 'std': 60, 'rule': 'Namibia'},
    'America/Adak': {'dst': -540, 'std': -600, 'rule': 'US'},
    'America/Anchorage': {'dst': -480, 'std': -540, 'rule': 'US'},
    'America/Anguilla': {'dst': -240, 'std': -240},
    'America/Antigua': {'dst': -240, 'std': -240},
    'America/Araguaina': {'dst': -180, 'std': -180},
    'America/Argentina/Buenos_Aires': {'dst': -180, 'std': -180},
    'America/Argentina/Catamarca': {'dst': -180, 'std': -180},
    'America/Argentina/Cordoba': {'dst': -180, 'std': -180},
    'America/Argentina/Jujuy': {'dst': -180, 'std': -180},
    'America/Argentina/La_Rioja': {'dst': -180, 'std': -180},
    'America/Argentina/Mendoza': {'dst': -180, 'std': -180},
    'America/Argentina/Rio_Gallegos': {'dst': -180, 'std': -180},
    'America/Argentina/Salta': {'dst': -180, 'std': -180},
    'America/Argentina/San_Juan': {'dst': -180, 'std': -180},
    'America/Argentina/San_Luis': {'dst': -180, 'std': -180},
    'America/Argentina/Tucuman': {'dst': -180, 'std': -180},
    'America/Argentina/Ushuaia': {'dst': -180, 'std': -180},
    'America/Aruba': {'dst': -240, 'std': -240},
    'America/Asuncion': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Atikokan': {'dst': -300, 'std': -300},
    'America/Bahia': {'dst': -120, 'std': -180, 'rule': 'Brazil'},
    'America/Bahia_Banderas': {'dst': -300, 'std': -360, 'rule': 'Mexico'},
    'America/Barbados': {'dst': -240, 'std': -240},
    'America/Belem': {'dst': -180, 'std': -180},
    'America/Belize': {'dst': -360, 'std': -360},
    'America/Blanc-Sablon': {'dst': -240, 'std': -240},
    'America/Boa_Vista': {'dst': -240, 'std': -240},
    'America/Bogota': {'dst': -300, 'std': -300},
    'America/Boise': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Cambridge_Bay': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Campo_Grande': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Cancun': {'dst': -300, 'std': -360, 'rule': 'Mexico'},
    'America/Caracas': {'dst': -270, 'std': -270},
    'America/Cayenne': {'dst': -180, 'std': -180},
    'America/Cayman': {'dst': -300, 'std': -300},
    'America/Chicago': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Chihuahua': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Costa_Rica': {'dst': -360, 'std': -360},
    'America/Creston': {'dst': -420, 'std': -420},
    'America/Cuiaba': {'dst': -180, 'std': -240, 'rule': 'Brazil'},
    'America/Curacao': {'dst': -240, 'std': -240},
    'America/Danmarkshavn': {'dst': 0, 'std': 0},
    'America/Dawson': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Dawson_Creek': {'dst': -420, 'std': -420},
    'America/Denver': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Detroit': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Dominica': {'dst': -240, 'std': -240},
    'America/Edmonton': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Eirunepe': {'dst': -300, 'std': -300},
    'America/El_Salvador': {'dst': -360, 'std': -360},
    'America/Fortaleza': {'dst': -180, 'std': -180},
    'America/Glace_Bay': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Godthab': {'dst': -120, 'std': -180, 'rule': 'Europe'},
    'America/Goose_Bay': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Grand_Turk': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Grenada': {'dst': -240, 'std': -240},
    'America/Guadeloupe': {'dst': -240, 'std': -240},
    'America/Guatemala': {'dst': -300, 'std': -300},
    'America/Guayaquil': {'dst': -300, 'std': -300},
    'America/Guyana': {'dst': -240, 'std': -240},
    'America/Halifax': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Havana': {'dst': -240, 'std': -300, 'rule': 'Cuba'},
    'America/Hermosillo': {'dst': -420, 'std': -420},
    'America/Indiana/Indianapolis': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Indiana/Knox': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Indiana/Marengo': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Indiana/Petersburg': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Indiana/Tell_City': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Indiana/Vevay': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Indiana/Vincennes': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Indiana/Winamac': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Inuvik': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Iqaluit': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Jamaica': {'dst': -300, 'std': -300},
    'America/Juneau': {'dst': -480, 'std': -540, 'rule': 'US'},
    'America/Kentucky/Louisville': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Kentucky/Monticello': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Kralendijk': {'dst': -240, 'std': -240},
    'America/La_Paz': {'dst': -240, 'std': -240},
    'America/Lima': {'dst': -300, 'std': -300},
    'America/Los_Angeles': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Lower_Princes': {'dst': -240, 'std': -240},
    'America/Maceio': {'dst': -180, 'std': -180},
    'America/Managua': {'dst': -360, 'std': -360},
    'America/Manaus': {'dst': -240, 'std': -240},
    'America/Marigot': {'dst': -240, 'std': -240},
    'America/Martinique': {'dst': -240, 'std': -240},
    'America/Matamoros': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Mazatlan': {'dst': -360, 'std': -420, 'rule': 'Mexico'},
    'America/Menominee': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Merida': {'dst': -300, 'std': -360, 'rule': 'Mexico'},
    'America/Metlakatla': {'dst': -480, 'std': -480},
    'America/Mexico_City': {'dst': -300, 'std': -360, 'rule': 'Mexico'},
    'America/Miquelon': {'dst': -120, 'std': -180, 'rule': 'US'},
    'America/Moncton': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Monterrey': {'dst': -300, 'std': -360, 'rule': 'Mexico'},
    'America/Montevideo': {'dst': -120, 'std': -180, 'rule': 'Uruguay'},
    'America/Montserrat': {'dst': -240, 'std': -240},
    'America/Nassau': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/New_York': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Nipigon': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Nome': {'dst': -480, 'std': -540, 'rule': 'US'},
    'America/Noronha': {'dst': -120, 'std': -120},
    'America/North_Dakota/Beulah': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/North_Dakota/Center': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/North_Dakota/New_Salem': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Ojinaga': {'dst': -360, 'std': -420, 'rule': 'US'},
    'America/Panama': {'dst': -300, 'std': -300},
    'America/Pangnirtung': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Paramaribo': {'dst': -180, 'std': -180},
    'America/Phoenix': {'dst': -420, 'std': -420},
    'America/Port-au-Prince': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Port_of_Spain': {'dst': -240, 'std': -240},
    'America/Porto_Velho': {'dst': -240, 'std': -240},
    'America/Puerto_Rico': {'dst': -240, 'std': -240},
    'America/Rainy_River': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Rankin_Inlet': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Recife': {'dst': -180, 'std': -180},
    'America/Regina': {'dst': -360, 'std': -360},
    'America/Resolute': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Rio_Branco': {'dst': -300, 'std': -300},
    'America/Santa_Isabel': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Santarem': {'dst': -180, 'std': -180},
    'America/Santiago': {'dst': -180, 'std': -240, 'rule': 'Chile'},
    'America/Santo_Domingo': {'dst': -240, 'std': -240},
    'America/Sao_Paulo': {'dst': -120, 'std': -180, 'rule': 'Brazil'},
    'America/Scoresbysund': {'dst': 0, 'std': -60, 'rule': 'Europe'},
    'America/Sitka': {'dst': -480, 'std': -540, 'rule': 'US'},
    'America/St_Barthelemy': {'dst': -240, 'std': -240},
    'America/St_Johns': {'dst': -150, 'std': -210, 'rule': 'US'},
    'America/St_Kitts': {'dst': -240, 'std': -240},
    'America/St_Lucia': {'dst': -240, 'std': -240},
    'America/St_Thomas': {'dst': -240, 'std': -240},
    'America/St_Vincent': {'dst': -240, 'std': -240},
    'America/Swift_Current': {'dst': -360, 'std': -360},
    'America/Tegucigalpa': {'dst': -360, 'std': -360},
    'America/Thule': {'dst': -180, 'std': -240, 'rule': 'US'},
    'America/Thunder_Bay': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Tijuana': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Toronto': {'dst': -240, 'std': -300, 'rule': 'US'},
    'America/Tortola': {'dst': -240, 'std': -240},
    'America/Vancouver': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Whitehorse': {'dst': -420, 'std': -480, 'rule': 'US'},
    'America/Winnipeg': {'dst': -300, 'std': -360, 'rule': 'US'},
    'America/Yakutat': {'dst': -480, 'std': -540, 'rule': 'US'},
    'America/Yellowknife': {'dst': -360, 'std': -420, 'rule': 'US'},
    'Antarctica/Casey': {'dst': 660, 'std': 660},
    'Antarctica/Davis': {'dst': 300, 'std': 300},
    'Antarctica/DumontDUrville': {'dst': 600, 'std': 600},
    'Antarctica/Macquarie': {'dst': 660, 'std': 660},
    'Antarctica/Mawson': {'dst': 300, 'std': 300},
    'Antarctica/McMurdo': {'dst': 780, 'std': 720, 'rule': 'NZ'},
    'Antarctica/Palmer': {'dst': -180, 'std': -240, 'rule': 'Palmer'},
    'Antarctica/Rothera': {'dst': -180, 'std': -180},
    'Antarctica/Syowa': {'dst': 180, 'std': 180},
    'Antarctica/Vostok': {'dst': 360, 'std': 360},
    'Arctic/Longyearbyen': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Asia/Aden': {'dst': 180, 'std': 180},
    'Asia/Almaty': {'dst': 360, 'std': 360 },
    'Asia/Amman': {'dst': 180, 'std': 120, 'rule': 'Jordan'},
    'Asia/Anadyr': {'dst': 720, 'std': 720},
    'Asia/Aqtau': {'dst': 300, 'std': 300},
    'Asia/Aqtobe': {'dst': 300, 'std': 300},
    'Asia/Ashgabat': {'dst': 300, 'std': 300},
    'Asia/Baghdad': {'dst': 180, 'std': 180},
    'Asia/Bahrain': {'dst': 180, 'std': 180},
    'Asia/Baku': {'dst': 300, 'std': 240, 'rule': 'Europe'},
    'Asia/Bangkok': {'dst': 420, 'std': 420},
    'Asia/Beirut': {'dst': 180, 'std': 120, 'rule': 'Lebanon'},
    'Asia/Bishkek': {'dst': 360, 'std': 360},
    'Asia/Brunei': {'dst': 480, 'std': 480},
    'Asia/Choibalsan': {'dst': 480, 'std': 480},
    'Asia/Chongqing': {'dst': 480, 'std': 480},
    'Asia/Colombo': {'dst': 330, 'std': 330},
    'Asia/Damascus': {'dst': 180, 'std': 120, 'rule': 'Syria'},
    'Asia/Dhaka': {'dst': 360, 'std': 360},
    'Asia/Dili': {'dst': 540, 'std': 540},
    'Asia/Dubai': {'dst': 240, 'std': 240},
    'Asia/Dushanbe': {'dst': 300, 'std': 300},
    'Asia/Gaza': {'dst': 180, 'std': 120, 'rule': 'Palestine'},
    'Asia/Harbin': {'dst': 480, 'std': 480},
    'Asia/Hebron': {'dst': 180, 'std': 120, 'rule': 'Palestine'},
    'Asia/Ho_Chi_Minh': {'dst': 420, 'std': 420},
    'Asia/Hong_Kong': {'dst': 480, 'std': 480},
    'Asia/Hovd': {'dst': 420, 'std': 420},
    'Asia/Irkutsk': {'dst': 540, 'std': 540},
    'Asia/Jakarta': {'dst': 420, 'std': 420},
    'Asia/Jayapura': {'dst': 540, 'std': 540},
    'Asia/Jerusalem': {'dst': 180, 'std': 120, 'rule': 'Israel'},
    'Asia/Kabul': {'dst': 270, 'std': 270},
    'Asia/Kamchatka': {'dst': 720, 'std': 720},
    'Asia/Karachi': {'dst': 300, 'std': 300},
    'Asia/Kashgar': {'dst': 480, 'std': 480},
    'Asia/Kathmandu': {'dst': 345, 'std': 345},
    'Asia/Khandyga': {'dst': 600, 'std': 600},
    'Asia/Kolkata': {'dst': 330, 'std': 330},
    'Asia/Krasnoyarsk': {'dst': 480, 'std': 480},
    'Asia/Kuala_Lumpur': {'dst': 480, 'std': 480},
    'Asia/Kuching': {'dst': 480, 'std': 480},
    'Asia/Kuwait': {'dst': 180, 'std': 180},
    'Asia/Macau': {'dst': 480, 'std': 480},
    'Asia/Magadan': {'dst': 720, 'std': 720},
    'Asia/Makassar': {'dst': 480, 'std': 480},
    'Asia/Manila': {'dst': 480, 'std': 480},
    'Asia/Muscat': {'dst': 240, 'std': 240},
    'Asia/Nicosia': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Asia/Novokuznetsk': {'dst': 420, 'std': 420},
    'Asia/Novosibirsk': {'dst': 420, 'std': 420},
    'Asia/Omsk': {'dst': 420, 'std': 420},
    'Asia/Oral': {'dst': 300, 'std': 300},
    'Asia/Phnom_Penh': {'dst': 420, 'std': 420},
    'Asia/Pontianak': {'dst': 420, 'std': 420},
    'Asia/Pyongyang': {'dst': 540, 'std': 540},
    'Asia/Qatar': {'dst': 180, 'std': 180},
    'Asia/Qyzylorda': {'dst': 360, 'std': 360},
    'Asia/Rangoon': {'dst': 390, 'std': 390},
    'Asia/Riyadh': {'dst': 180, 'std': 180},
    'Asia/Sakhalin': {'dst': 660, 'std': 660},
    'Asia/Samarkand': {'dst': 300, 'std': 300},
    'Asia/Seoul': {'dst': 540, 'std': 540},
    'Asia/Shanghai': {'dst': 480, 'std': 480},
    'Asia/Singapore': {'dst': 480, 'std': 480},
    'Asia/Taipei': {'dst': 480, 'std': 480},
    'Asia/Tashkent': {'dst': 300, 'std': 300},
    'Asia/Tbilisi': {'dst': 240, 'std': 240},
    'Asia/Tehran': {'dst': 270, 'std': 210, 'rule': 'Iran'},
    'Asia/Thimphu': {'dst': 360, 'std': 360},
    'Asia/Tokyo': {'dst': 540, 'std': 540},
    'Asia/Ulaanbaatar': {'dst': 480, 'std': 480},
    'Asia/Urumqi': {'dst': 480, 'std': 480},
    'Asia/Ust-Nera': {'dst': 660, 'std': 660},
    'Asia/Vientiane': {'dst': 420, 'std': 420},
    'Asia/Vladivostok': {'dst': 660, 'std': 660},
    'Asia/Yakutsk': {'dst': 600, 'std': 600},
    'Asia/Yekaterinburg': {'dst': 360, 'std': 360},
    'Asia/Yerevan': {'dst': 240, 'std': 240},
    'Atlantic/Azores': {'dst': 0, 'std': -60, 'rule': 'Europe'},
    'Atlantic/Bermuda': {'dst': -180, 'std': -240, 'rule': 'US'},
    'Atlantic/Canary': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Atlantic/Cape_Verde': {'dst': -60, 'std': -60},
    'Atlantic/Faroe': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Atlantic/Madeira': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Atlantic/Reykjavik': {'dst': 0, 'std': 0},
    'Atlantic/South_Georgia': {'dst': -120, 'std': -120},
    'Atlantic/St_Helena': {'dst': 0, 'std': 0},
    'Atlantic/Stanley': {'dst': -180, 'std': -180},
    'Australia/Adelaide': {'dst': 630, 'std': 570, 'rule': 'Australia'},
    'Australia/Brisbane': {'dst': 600, 'std': 600},
    'Australia/Broken_Hill': {'dst': 630, 'std': 570, 'rule': 'Australia'},
    'Australia/Currie': {'dst': 660, 'std': 600, 'rule': 'Australia'},
    'Australia/Darwin': {'dst': 570, 'std': 570},
    'Australia/Eucla': {'dst': 525, 'std': 525},
    'Australia/Hobart': {'dst': 660, 'std': 600, 'rule': 'Australia'},
    'Australia/Lindeman': {'dst': 600, 'std': 600},
    'Australia/Lord_Howe': {'dst': 660, 'std': 630, 'rule': 'Australia'},
    'Australia/Melbourne': {'dst': 660, 'std': 600, 'rule': 'Australia'},
    'Australia/Perth': {'dst': 480, 'std': 480},
    'Australia/Sydney': {'dst': 660, 'std': 600, 'rule': 'Australia'},
    'Europe/Amsterdam': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Andorra': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Athens': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Belgrade': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Berlin': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Bratislava': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Brussels': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Bucharest': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Budapest': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Busingen': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Chisinau': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Copenhagen': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Dublin': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Gibraltar': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Guernsey': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Helsinki': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Isle_of_Man': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Istanbul': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Jersey': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Kaliningrad': {'dst': 180, 'std': 180, 'rule': 'Europe'},
    'Europe/Kiev': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Lisbon': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Ljubljana': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/London': {'dst': 60, 'std': 0, 'rule': 'Europe'},
    'Europe/Luxembourg': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Madrid': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Malta': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Mariehamn': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Minsk': {'dst': 180, 'std': 180},
    'Europe/Monaco': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Moscow': {'dst': 240, 'std': 240},
    'Europe/Oslo': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Paris': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Podgorica': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Prague': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Riga': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Rome': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Samara': {'dst': 240, 'std': 240},
    'Europe/San_Marino': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Sarajevo': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Simferopol': {'dst': 240, 'std': 240},
    'Europe/Skopje': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Sofia': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Stockholm': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Tallinn': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Tirane': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Uzhgorod': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Vaduz': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Vatican': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Vienna': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Vilnius': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Volgograd': {'dst': 240, 'std': 240},
    'Europe/Warsaw': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Zagreb': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Europe/Zaporozhye': {'dst': 180, 'std': 120, 'rule': 'Europe'},
    'Europe/Zurich': {'dst': 120, 'std': 60, 'rule': 'Europe'},
    'Indian/Antananarivo': {'dst': 180, 'std': 180},
    'Indian/Chagos': {'dst': 360, 'std': 360},
    'Indian/Christmas': {'dst': 420, 'std': 420},
    'Indian/Cocos': {'dst': 390, 'std': 390},
    'Indian/Comoro': {'dst': 180, 'std': 180},
    'Indian/Kerguelen': {'dst': 300, 'std': 300},
    'Indian/Mahe': {'dst': 240, 'std': 240},
    'Indian/Maldives': {'dst': 300, 'std': 300},
    'Indian/Mauritius': {'dst': 240, 'std': 240},
    'Indian/Mayotte': {'dst': 180, 'std': 180},
    'Indian/Reunion': {'dst': 240, 'std': 240},
    'Pacific/Apia': {'dst': 840, 'std': 780, 'rule': 'NZ'},
    'Pacific/Auckland': {'dst': 780, 'std': 720, 'rule': 'NZ'},
    'Pacific/Chatham': {'dst': 825, 'std':765, 'rule': 'NZ'},
    'Pacific/Chuuk': {'dst': 600, 'std': 600},
    'Pacific/Easter': {'dst': -300, 'std': -360, 'rule': 'NZ'},
    'Pacific/Efate': {'dst':660, 'std': 660},
    'Pacific/Enderbury': {'dst': 780, 'std': 780},
    'Pacific/Fakaofo': {'dst': 780, 'std': 780},
    'Pacific/Fiji': {'dst': 780, 'std': 720, 'rule': 'Fiji'},
    'Pacific/Funafuti': {'dst': 720, 'std': 720},
    'Pacific/Galapagos': {'dst': -360, 'std': -360},
    'Pacific/Gambier': {'dst': -540, 'std': -540},
    'Pacific/Guadalcanal': {'dst': 660, 'std': 660},
    'Pacific/Guam': {'dst': 600, 'std': 600},
    'Pacific/Honolulu': {'dst': -600, 'std': -600},
    'Pacific/Johnston': {'dst': -600, 'std': -600},
    'Pacific/Kiritimati': {'dst': 780, 'std': 780},
    'Pacific/Kosrae': {'dst': 660, 'std': 660},
    'Pacific/Kwajalein': {'dst': 720, 'std': 720},
    'Pacific/Majuro': {'dst': 720, 'std': 720},
    'Pacific/Marquesas': {'dst': -570, 'std': -570},
    'Pacific/Midway': {'dst': -660, 'std': -660},
    'Pacific/Nauru': {'dst': 720, 'std': 720},
    'Pacific/Niue': {'dst': -660, 'std': -660},
    'Pacific/Norfolk': {'dst': 690, 'std': 690},
    'Pacific/Noumea': {'dst': 660, 'std': 660},
    'Pacific/Pago_Pago': {'dst': -660, 'std': -660},
    'Pacific/Palau': {'dst': 540, 'std': 540},
    'Pacific/Pitcairn': {'dst': -480, 'std': -480},
    'Pacific/Pohnpei': {'dst': 660, 'std': 660},
    'Pacific/Port_Moresby': {'dst': 600, 'std': 600},
    'Pacific/Rarotonga': {'dst': -600, 'std': -600},
    'Pacific/Saipan': {'dst': 600, 'std': 600},
    'Pacific/Tahiti': {'dst': -600, 'std': -600},
    'Pacific/Tarawa': {'dst': 720, 'std': 720},
    'Pacific/Tongatapu': {'dst': 780, 'std': 780},
    'Pacific/Wake': {'dst': 720, 'std': 720},
    'Pacific/Wallis': {'dst': 720, 'std': 720}
};

var guessTimeZone = function(std, dst) {
    var defaults = [
        'Pacific/Midway',
        'America/Adak',
        'Pacific/Honolulu',
        'Pacific/Marquesas',
        'America/Anchorage',
        'Pacific/Gambier',
        'America/Los_Angeles',
        'Pacific/Pitcairn',
        'America/Denver',
        'America/Phoenix',
        'America/Chicago',
        'America/Costa_Rica',
        'America/New_York',
        'America/Jamaica',
        'America/Caracas',
        'America/Halifax',
        'America/St_Thomas',
        'America/St_Johns',
        'America/Sao_Paulo',
        'America/Argentina/Buenos_Aires',
        'America/Noronha',
        'Atlantic/Azores',
        'Atlantic/Cape_Verde',
        'Europe/London',
        'Atlantic/Reykjavik',
        'Europe/Paris',
        'Africa/Lagos',
        'Europe/Istanbul',
        'Africa/Kigali',
        'Africa/Nairobi',
        'Asia/Tehran',
        'Europe/Moscow',
        'Asia/Kabul',
        'Indian/Maldives',
        'Asia/Kolkata',
        'Asia/Kathmandu',
        'Asia/Dhaka',
        'Asia/Rangoon',
        'Asia/Bangkok',
        'Asia/Shanghai',
        'Australia/Eucla',
        'Asia/Tokyo',
        'Australia/Adelaide',
        'Australia/Darwin',
        'Australia/Sydney',
        'Australia/Brisbane',
        'Australia/Lord_Howe',
        'Asia/Vladivostok',
        'Pacific/Norfolk',
        'Pacific/Auckland',
        'Asia/Kamchatka',
        'Pacific/Chatham',
        'Pacific/Apia',
        'Pacific/Enderbury',
        'Pacific/Kiritimati' ];

    if (typeof std === 'undefined' || typeof dst === 'undefined') {
        var summer = -(new Date(2014, 5, 22).getTimezoneOffset());
        var winter = -(new Date(2014, 0, 1).getTimezoneOffset());

        std = Math.min(summer, winter);
        dst = Math.max(summer, winter);
    }

    for (var i in defaults) {
        var zone = defaults[i];
        var data = timeZones[zone];
        if (std === data.std && dst === data.dst) return zone;
    }

    return undefined;
};

/**
 * Returns a date object where the local time values match what the local
 * time is in the provided time zone at the specified UTC time.
 *
 * This is useful when a date or time must be output for a time zone that
 * does not match the local machine's time zone.
 */
var localizeDate = function(zone, utc) {
    var data = timeZones[zone || ''];
    if (!data) return undefined;

    var dst = false;
    if (data.std !== data.dst) dst = dstRules[data.rule](data, utc);

    var offset = (dst ? data.dst : data.std) + utc.getTimezoneOffset();
    return new Date(utc.valueOf() + offset * 60 * 1000);
};

/**
 * Returns a Date object that has the same time (in UTC) as the
 * provided time in the specified time zone.
 *
 * Used when taking a user-provided time in a local time zone and
 * generating an identical timestamp in UTC.
 */
var normalizeDate = function(zone, year, month, date, hour, min) {
    if (!timeZones[zone || '']) return undefined;

    var zoneDst = false, zd = timeZones[zone];
    if (zd.rule) zoneDst = dstRules[zd.rule](zd, year, month, date, hour);

    var local = new Date(year, month, date, hour || 0, min || 0);
    var shift = local.getTimezoneOffset() + (zoneDst ? zd.dst : zd.std);

    return new Date(local.valueOf() - shift * 60 * 1000);
};

module.exports = {
    'utils': {
        dateForDayInWeek: dateForDayInWeek,
        dateOfRoshHashanah: dateOfRoshHashanah,
        localizeDate: localizeDate,
        normalizeDate: normalizeDate,
        guessTimeZone: guessTimeZone
    },
    nameOfZone: function(abbr) {
        return abbrToName[abbr];
    },
    abbrForZone: function(name) {
        return nameToAbbr[name];
    },
    'zones': timeZones
};
