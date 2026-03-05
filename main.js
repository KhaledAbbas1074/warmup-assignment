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
    // TODO: Implement this function
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    // TODO: Implement this function
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    // TODO: Implement this function
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
    // TODO: Implement this function
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
    // TODO: Implement this function
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
