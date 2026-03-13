const fs = require("fs");
// ============================================================
// Helper to convert hh:mm:ss am/pm to total seconds since midnight.
function timeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();

    var parts = timeStr.split(' ');
    var timeField = parts[0];
    var period = parts[1];

    var timeParts = timeField.split(':');
    var hours = parseInt(timeParts[0], 10);
    var minutes = parseInt(timeParts[1], 10);
    var seconds = parseInt(timeParts[2], 10);

    if (period === 'pm' && hours !== 12) {
        hours = hours + 12;
    } else if (period === 'am' && hours === 12) {
        hours = 0;
    }

    return (hours * 3600) + (minutes * 60) + seconds;
}

// Helper to format total seconds into h:mm:ss
function formatTime(totalSeconds) {
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;

    var mStr = m.toString();
    if (mStr.length < 2) {
        mStr = "0" + mStr;
    }

    var sStr = s.toString();
    if (sStr.length < 2) {
        sStr = "0" + sStr;
    }

    return h + ":" + mStr + ":" + sStr;
}

// Helper to convert an h:mm:ss duration string to total seconds
function durationToSeconds(durationStr) {
    var parts = durationStr.split(':');
    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1], 10);
    var seconds = parseInt(parts[2], 10);

    return (hours * 3600) + (minutes * 60) + seconds;
}

// Helper to check if a date string yyyy-mm-dd falls within Eid al-Fitr 2025
function isEidPeriod(dateStr) {
    // 2025-04-10 to 2025-04-30
    var parts = dateStr.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);

    if (year === 2025 && month === 4) {
        if (day >= 10 && day <= 30) {
            return true;
        }
    }
    return false;
}
// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    var startSec = timeToSeconds(startTime);
    var endSec = timeToSeconds(endTime);

    var diffSec = endSec - startSec;
    if (diffSec < 0) {
        diffSec = diffSec + (24 * 3600); // Handle overnight shifts crossing midnight
    }

    return formatTime(diffSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    var startSec = timeToSeconds(startTime);
    var endSec = timeToSeconds(endTime);

    if (endSec < startSec) {
        endSec = endSec + (24 * 3600);
    }

    var idleSeconds = 0;
    // Iterate through each second of the shift
    for (var i = startSec; i < endSec; i++) {
        var timeOfDay = i % (24 * 3600);
        // Delivery hours are 8:00 AM (8 * 3600) to 10:00 PM (22 * 3600)
        if (timeOfDay < (8 * 3600) || timeOfDay >= (22 * 3600)) {
            idleSeconds++;
        }
    }

    return formatTime(idleSeconds);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    var shiftSec = durationToSeconds(shiftDuration);
    var idleSec = durationToSeconds(idleTime);

    var activeSec = shiftSec - idleSec;
    // ensure active time isn't negative theoretically
    if (activeSec < 0) {
        activeSec = 0;
    }

    return formatTime(activeSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    var activeSec = durationToSeconds(activeTime);

    var quotaSec = 0;
    if (isEidPeriod(date)) {
        // 6 hours
        quotaSec = 6 * 3600;
    } else {
        // 8 hours and 24 minutes
        quotaSec = (8 * 3600) + (24 * 60);
    }

    return activeSec >= quotaSec;
}


// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    var fileContent = "";
    try {
        fileContent = fs.readFileSync(textFile, "utf8");
    } catch (err) {
        // If file doesn't exist yet, we'll start fresh
        fileContent = "";
    }

    var lines = fileContent.split("\n");
    // Remove any empty lines at end just in case for iteration
    if (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }

    var lastDriverIndex = -1;

    // Check for duplicates and find last occurrence of driverID
    // Format is CSV: driverID,driverName,date,...
    for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split(",");
        if (parts.length >= 3) {
            var currDriverID = parts[0];
            var currDate = parts[2];

            // 1. Is duplicate?
            if (currDriverID === shiftObj.driverID && currDate === shiftObj.date) {
                return {};
            }

            // Keep track of last occurrence
            if (currDriverID === shiftObj.driverID) {
                lastDriverIndex = i;
            }
        }
    }

    // 2. Calculate remaining 5 properties using helpers defined above
    var duration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    var idle = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    var active = getActiveTime(duration, idle);
    var quotaMet = metQuota(shiftObj.date, active);

    // Build full object copy
    var newShift = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: duration,
        idleTime: idle,
        activeTime: active,
        metQuota: quotaMet,
        hasBonus: false // 4. default value is false
    };

    // Create new CSV row string
    var newRow = [
        newShift.driverID,
        newShift.driverName,
        newShift.date,
        newShift.startTime,
        newShift.endTime,
        newShift.shiftDuration,
        newShift.idleTime,
        newShift.activeTime,
        newShift.metQuota,
        newShift.hasBonus
    ].join(",");

    // 3. Insert after last record of driverID, or append to end
    if (lastDriverIndex !== -1) {
        // Driver exists - insert after its last index
        lines.splice(lastDriverIndex + 1, 0, newRow);
    } else {
        // Append to the end
        lines.push(newRow);
    }

    // Write back to file as normal string ensuring newline at end if required
    fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");

    return newShift;
}


// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    var fileContent = "";
    try {
        fileContent = fs.readFileSync(textFile, "utf8");
    } catch (err) {
        return; // File doesn't exist
    }

    var lines = fileContent.split("\n");
    // Remove any trailing empty line temporarily
    var hasTrailingNewline = false;
    if (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
        hasTrailingNewline = true;
    }

    for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split(",");
        if (parts.length >= 10) {
            // Trim inputs to ensure clean matching
            var currDriverID = parts[0].trim();
            var currDate = parts[2].trim();

            if (currDriverID === driverID.trim() && currDate === date.trim()) {
                // The 10th column (index 9) is hasBonus
                parts[9] = newValue.toString(); // Output "true" or "false"
                lines[i] = parts.join(",");
                break; // Assuming only one valid entry matching driverID and date
            }
        }
    }

    // Add trailing newline back if it originally existed or just append one
    fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    if (!month || month.trim() === "") {
        return -1;
    }

    // Standardize month to an integer for safe comparison (handles "04" vs "4")
    var targetMonthInt = parseInt(month, 10);
    if (isNaN(targetMonthInt) || targetMonthInt < 1 || targetMonthInt > 12) {
        return -1; // Invalid month
    }

    var fileContent = "";
    try {
        fileContent = fs.readFileSync(textFile, "utf8");
    } catch (err) {
        return -1; // File doesn't exist
    }

    var lines = fileContent.split("\n");

    var driverExists = false;
    var bonusCount = 0;

    for (var i = 0; i < lines.length; i++) {
        var strLine = lines[i].trim();
        if (strLine === "") continue;

        var parts = strLine.split(",");
        if (parts.length >= 10) {
            var currDriverID = parts[0].trim();

            if (currDriverID === driverID.trim()) {
                driverExists = true;

                var currDateStr = parts[2].trim();
                var dateParts = currDateStr.split('-');
                if (dateParts.length >= 2) {
                    var currMonthInt = parseInt(dateParts[1], 10);

                    if (currMonthInt === targetMonthInt) {
                        var hasBonusStr = parts[9].trim().toLowerCase();
                        if (hasBonusStr === "true") {
                            bonusCount++;
                        }
                    }
                }
            }
        }
    }

    if (!driverExists) {
        return -1;
    }

    return bonusCount;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    var fileContent = "";
    try {
        fileContent = fs.readFileSync(textFile, "utf8");
    } catch (err) {
        return "0:00:00"; // File doesn't exist
    }

    var lines = fileContent.split("\n");
    var totalActiveSeconds = 0;

    // Ensure month compares consistently
    var targetMonthInt = parseInt(month, 10);

    for (var i = 0; i < lines.length; i++) {
        var strLine = lines[i].trim();
        if (strLine === "") continue;

        var parts = strLine.split(",");
        if (parts.length >= 10) {
            var currDriverID = parts[0].trim();
            if (currDriverID === driverID.trim()) {
                var currDateStr = parts[2].trim();
                var dateParts = currDateStr.split('-');
                if (dateParts.length >= 2) {
                    var currMonthInt = parseInt(dateParts[1], 10);

                    if (currMonthInt === targetMonthInt) {
                        // The activeTime is stored at index 7 (shiftDuration is 5, idleTime is 6, activeTime is 7)
                        var activeTimeStr = parts[7].trim();
                        totalActiveSeconds += durationToSeconds(activeTimeStr);
                    }
                }
            }
        }
    }

    return formatLongTime(totalActiveSeconds);
}

// Helper to format total seconds into hhh:mm:ss specifically for negative/large hours
function formatLongTime(totalSeconds) {
    var isNegative = totalSeconds < 0;
    if (isNegative) {
        totalSeconds = -totalSeconds;
    }

    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;

    var mStr = m.toString();
    if (mStr.length < 2) {
        mStr = "0" + mStr;
    }

    var sStr = s.toString();
    if (sStr.length < 2) {
        sStr = "0" + sStr;
    }

    var sign = isNegative ? "-" : "";
    return sign + h + ":" + mStr + ":" + sStr;
}

// Helper to get driver's day off from rateFile
function getDriverDayOff(rateFile, driverID) {
    try {
        var rateContent = fs.readFileSync(rateFile, "utf8");
        var lines = rateContent.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].split(",");
            if (parts.length >= 2) {
                if (parts[0].trim() === driverID.trim()) {
                    return parts[1].trim().toLowerCase();
                }
            }
        }
    } catch (e) {
        // Ignored
    }
    return "";
}

// Helper to map 0-6 to day strings
function getDayOfWeekString(dateString) {
    var d = new Date(dateString);
    var days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[d.getDay()]; // Note: getDay() uses local timezone which might slightly be a risk if dateString is just yyyy-mm-dd. Let's append T00:00:00 to be safe.
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    var dayOff = getDriverDayOff(rateFile, driverID);

    var shiftContent = "";
    try {
        shiftContent = fs.readFileSync(textFile, "utf8");
    } catch (e) {
        return "0:00:00";
    }

    var lines = shiftContent.split("\n");
    var totalRequiredSeconds = 0;

    // Track unique dates worked by this driver to avoid double counting if duplicate entries exist (though assignment says they shouldn't)
    var processedDates = {};

    for (var i = 0; i < lines.length; i++) {
        var strLine = lines[i].trim();
        if (strLine === "") continue;

        var parts = strLine.split(",");
        if (parts.length >= 10) {
            var currDriverID = parts[0].trim();
            if (currDriverID === driverID.trim()) {
                var currDateStr = parts[2].trim();
                var dateParts = currDateStr.split('-');
                if (dateParts.length >= 2) {
                    var currMonth = parseInt(dateParts[1], 10);

                    if (currMonth === parseInt(month, 10)) {
                        // Skip if already processed
                        if (processedDates[currDateStr]) continue;
                        processedDates[currDateStr] = true;

                        // Check if day off
                        // For safety parsing local midnight:
                        var d = new Date(currDateStr + "T00:00:00");
                        var days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                        var dayOfWeek = days[d.getDay()];

                        if (dayOfWeek === dayOff) {
                            continue;
                        }

                        // Add daily quota
                        if (isEidPeriod(currDateStr)) {
                            totalRequiredSeconds += (6 * 3600);
                        } else {
                            totalRequiredSeconds += (8 * 3600) + (24 * 60);
                        }
                    }
                }
            }
        }
    }

    // Deduct bonuses
    var bonusDeductionSeconds = bonusCount * 2 * 3600;
    totalRequiredSeconds -= bonusDeductionSeconds;

    return formatLongTime(totalRequiredSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    var basePay = 0;
    var tier = 0; 

    // 1. Fetch from rate file (driverID, dayOff, basePay, tier)
    try {
        var rateContent = fs.readFileSync(rateFile, "utf8");
        var lines = rateContent.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].split(",");
            if (parts.length >= 4) {
                if (parts[0].trim() === driverID.trim()) {
                    basePay = parseInt(parts[2].trim(), 10);
                    tier = parseInt(parts[3].trim(), 10);
                    break;
                }
            }
        }
    } catch (e) {
        return 0; // If file breaks, safe return
    }

    // 2. Calculate tier allowance
    var allowedMissingHours = 0;
    if (tier === 1) {
        allowedMissingHours = 50;
    } else if (tier === 2) {
        allowedMissingHours = 20;
    } else if (tier === 3) {
        allowedMissingHours = 10;
    } else if (tier === 4) {
        allowedMissingHours = 3;
    }

    var allowedMissingSeconds = allowedMissingHours * 3600;

    // 3. Compare required vs actual
    var reqSec = durationToSeconds(requiredHours);
    var actSec = durationToSeconds(actualHours);

    if (actSec >= reqSec) {
        return basePay; // No deductions if met or exceeded
    }

    // 4. Calculate deduction
    var rawMissingSeconds = reqSec - actSec;
    var billableMissingSeconds = rawMissingSeconds - allowedMissingSeconds;

    if (billableMissingSeconds <= 0) {
        return basePay; // Allowance covered the deficit
    }


    var billableMissingHours = Math.floor(billableMissingSeconds / 3600);

    // deductionRatePerHour = floor(basePay / 185)
    var deductionRatePerHour = Math.floor(basePay / 185);

    var salaryDeduction = billableMissingHours * deductionRatePerHour;
    var netPay = basePay - salaryDeduction;

    return netPay;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
