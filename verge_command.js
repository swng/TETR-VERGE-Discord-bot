const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { prefix, token } = require("./config.json");
const { decoder, encoder, Field } = require("tetris-fumen");
const { createCanvas } = require("canvas");
const GIFEncoder = require("gifencoder");
const { http, https } = require("follow-redirects");
const fs = require("fs");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel, Partials.Message],
});

const colors = {
    I: { normal: "#009999", light: "#00FFFF" },
    T: { normal: "#990099", light: "#FF00FF" },
    S: { normal: "#009900", light: "#00FF00" },
    Z: { normal: "#990000", light: "#FF0000" },
    L: { normal: "#996600", light: "#FF9900" },
    J: { normal: "#0000BB", light: "#0000FF" },
    O: { normal: "#999900", light: "#FFFF00" },
    X: { normal: "#999999", light: "#CCCCCC" },
    Empty: { normal: "#f3f3ed" },
};

function draw(fumenPage, tilesize, numrows, transparent) {
    const field = fumenPage.field;
    const operation = fumenPage.operation;

    function operationFilter(e) {
        return i == e.x && j == e.y;
    }

    if (numrows == undefined) {
        numrows = 0;
        for (i = 0; i < 10; i++) {
            for (j = 0; j < 23; j++) {
                if (field.at(i, j) != "_") {
                    numrows = Math.max(numrows, j);
                }
                if (operation != undefined && operation.positions().filter(operationFilter).length > 0) {
                    numrows = Math.max(numrows, j);
                }
            }
        }
        numrows += 2;
    }
    const width = tilesize * 10;
    const height = numrows * tilesize;

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    var gridCvs = createCanvas(tilesize, tilesize);
    var gridCtx = gridCvs.getContext("2d");

    gridCtx.fillStyle = "#000000";
    if (transparent) gridCtx.fillStyle = "rgba(0, 0, 0, 0)";
    gridCtx.fillRect(0, 0, tilesize, tilesize);
    gridCtx.strokeStyle = "#333333";
    gridCtx.strokeRect(0, 0, tilesize, tilesize);
    var pattern = context.createPattern(gridCvs, "repeat");

    context.clearRect(0, 0, width, height);
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);

    for (i = 0; i < 10; i++) {
        for (j = 0; j < numrows; j++) {
            if (field.at(i, j) != "_") {
                context.fillStyle = colors[field.at(i, j)].light;
                context.fillRect(i * tilesize + 1, height - (j + 1) * tilesize + 1, tilesize - 2, tilesize - 2);
            }
            if (operation != undefined && operation.positions().filter(operationFilter).length > 0) {
                context.fillStyle = colors[operation.type].light;
                context.fillRect(i * tilesize + 1, height - (j + 1) * tilesize + 1, tilesize - 2, tilesize - 2);
            }
        }
    }
    return canvas;
}

function drawFumens(fumenPages, tilesize, numrows, start, end, transparent, delay) {
    if (end == undefined) {
        end = fumenPages.length;
    }
    if (numrows == undefined) {
        numrows = 0;
        function operationFilter(e) {
            return i == e.x && j == e.y;
        }
        for (x = start; x < end; x++) {
            field = fumenPages[x].field;
            operation = fumenPages[x].operation;
            for (i = 0; i < 10; i++) {
                for (j = 0; j < 23; j++) {
                    if (field.at(i, j) != "_") {
                        numrows = Math.max(numrows, j);
                    }
                    if (operation != undefined && operation.positions().filter(operationFilter).length > 0) {
                        numrows = Math.max(numrows, j);
                    }
                }
            }
        }
        numrows += 2;
    }
    numrows = Math.min(23, numrows);
    const width = tilesize * 10;
    const height = numrows * tilesize;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const encoder = new GIFEncoder(width, height);
    encoder.start();
    encoder.setRepeat(0); // 0 for repeat, -1 for no-repeat
    encoder.setDelay(500); // frame delay in ms
    if (delay != undefined) encoder.setDelay(delay);
    encoder.setQuality(1); // image quality. 10 is default.
    if (transparent) {
        encoder.setTransparent("rgba(0, 0, 0, 0)");
    }
    for (x = start; x < end; x++) {
        encoder.addFrame(draw(fumenPages[x], tilesize, numrows, transparent).getContext("2d"));
    }
    return encoder;
}

async function parse_fumen_argument(argument) {
    // raw fumen code or a direct link with the raw fumen code in its url
    const fumen_regex = /(\[)?\d+@(.+)/;
    let match = argument.match(fumen_regex);
    if (match) return "v" + match[0];

    // redirecting link such as tinyurl
    let url = argument;

    try {
        return new Promise((resolve, reject) => {
            let client = url.startsWith("https://") ? https : undefined;
            if (client == undefined) client = url.startsWith("http://") ? http : undefined;
            if (client == undefined) resolve(undefined);

            const options = {
                method: "HEAD",
                followRedirects: true,
            };

            const req = client.request(url, options, (res) => {
                let match = res.responseUrl.match(fumen_regex);
                if (match) resolve("v" + match[0]);
                resolve(undefined);
            });

            req.on("error", (error) => {
                resolve(undefined);
            });

            req.end();
        });
    } catch {
        return undefined;
    }
}

// Some useful functions
async function getData(req) {
    const url = "https://ch.tetr.io/api/";
    var data = await (await fetch(url + req)).json();
    return data;
}
function stringify(json) {
    var data = JSON.stringify(json);
    return data.replace(/"/g, "");
}

function calculatePercentile(value, array) {
    for (var i = 0; i < array.length; i++) {
        if (value < array[i]) {
            return (100 * i) / array.length;
        }
    }
    return 100;
}

async function verge(username) {
    let result = username + "\n";

    let tlDataPromise = getData("users/lists/league/all");

    if (true) {
        let usernameNode = {
            textContent: username,
        };

        function addTrait(value, description, color, id) {
            result += value + " " + description + "\n";
        }

        async function calculateUserStats() {
            var tStart = Date.now();
            if (!usernameNode) {
                return;
            }
            // addTrait("TETR.IO VERGE IS LOADING. . .", "This may take up to 5 seconds depending on your internet connection and TETR.IO API response times.", "#b3f4b6", "loading");

            var user = usernameNode.textContent.toLowerCase();
            // console.log(user)
            // Get the user's data
            let mainUserDataPromise;
            let mainUserData;
            try {
                mainUserDataPromise = getData("users/" + user);
                mainUserData = await mainUserDataPromise;
                if (!mainUserData.success) {
                    return;
                }
            } catch {
                return;
            }

            // Get the user's tetra league history
            let mainUserDataHistoryPromise = getData("streams/league_userrecent_" + mainUserData.data.user._id);
            let mainUserDataHistory = await mainUserDataHistoryPromise;

            // Get the tetra league leaderboard, we call this now because it takes a good while to fetch sometimes
            let tlData = await tlDataPromise;

            // This is the better version of tlData
            let tlUsers = tlData.data.users;

            if (!tlData.success || !mainUserData.success || mainUserData.data.user.role == "banned" || !mainUserDataHistory.data.records.length) {
                console.log("User data is either non-existent or could not be fetched.");
                console.log("USER TETRA LEAGUE DATA CANNOT BE FOUND");
                console.log("Party's over. . . This can happen if the user hasn't played any tetra league games.");
                return;
            }

            var mainUserMatchHistory = [];
            var mainUserOpponents = [];
            for (let i = 0; i < mainUserDataHistory.data.records.length; i++) {
                if (mainUserDataHistory.data.records[i].endcontext[0].username == user) {
                    mainUserMatchHistory.push(true);
                    mainUserOpponents.push(mainUserDataHistory.data.records[i].endcontext[1].username);
                } else {
                    mainUserMatchHistory.push(false);
                    mainUserOpponents.push(mainUserDataHistory.data.records[i].endcontext[0].username);
                }
            }

            // console.log(mainUserMatchHistory);
            // console.log(mainUserOpponents);

            var mainUserMatchHistoryData = [];

            for await (let user of mainUserOpponents) {
                let data = await getData("users/" + user);
                if (data.data.user.role != "banned") mainUserMatchHistoryData.push(data);
            }
            // console.log(mainUserMatchHistoryData);

            // console.log("User data fetched in " + (Date.now() - tStart) / 1000 + " seconds!")

            tStart = Date.now();

            var pps = [];
            var apm = [];
            var vs = [];
            var tr = [];

            // -0.4055 is the secret formula ;)
            var skillGroupRange = Math.round(-0.4055 * (mainUserData.data.user.league.percentile ** 2 - mainUserData.data.user.league.percentile) * tlUsers.length + 10);

            var lowerSkillGroup =
                mainUserData.data.user.league.standing - 1 + skillGroupRange < tlUsers.length ? mainUserData.data.user.league.standing - 1 + skillGroupRange : tlUsers.length;
            var upperSkillGroup = mainUserData.data.user.league.standing - 1 - skillGroupRange > 0 ? mainUserData.data.user.league.standing - 1 - skillGroupRange : 0;

            // console.log("Sample size: " + (lowerSkillGroup - upperSkillGroup) + " players");
            // console.log(upperSkillGroup)
            // console.log(lowerSkillGroup)
            // console.log(skillGroupRange);

            // console.log(mainUserData.data.user.league.percentile);
            for (var i = upperSkillGroup; i < lowerSkillGroup; i++) {
                pps.push(tlUsers[i].league.pps);
                apm.push(tlUsers[i].league.apm);
                vs.push(tlUsers[i].league.vs);
                tr.push(tlUsers[i].league.rating);
            }

            pps.sort(function (a, b) {
                return a - b;
            });
            apm.sort(function (a, b) {
                return a - b;
            });
            vs.sort(function (a, b) {
                return a - b;
            });
            tr.sort(function (a, b) {
                return a - b;
            });

            var userPps = mainUserData.data.user.league.pps;
            var userApm = mainUserData.data.user.league.apm;
            var userVs = mainUserData.data.user.league.vs;
            //var userTr = mainUserData.data.user.league.rating;
            var userApp = userApm / 60 / userPps;
            var userVsapm = userVs / userApm;
            var userDsps = userVs / 100 - userApm / 60;
            var userDspp = userDsps / userPps;
            var userGe = (2 * userApp * userDsps) / userPps;

            // Thanks to sheetbot's creators for the formulas below!! I can't thank you enough <3

            var srarea = userApm * 0 + userPps * 135 + userVs * 0 + userApp * 290 + userDsps * 0 + userDspp * 700 + userGe * 0;
            var statrank = 11.2 * Math.atan((srarea - 93) / 130) + 1;

            // console.log("Current user: " + mainUserData.data.user.username);

            var goodMood = 0;
            var badMood = 0;
            var overConfident = 0;
            var vengeance = 0;
            var wins = 0;
            var losses = 0;

            var precision = 3;

            for (var i = 0; i < mainUserDataHistory.data.records.length - 1; i++) {
                // If the user won the match and the previous match, increment good mood score
                if (mainUserDataHistory.data.records[i].endcontext[0].username == user && mainUserDataHistory.data.records[i + 1].endcontext[0].username == user) {
                    goodMood++;
                    wins++;
                    // If the user lost the match and the previous match, increment bad mood score
                } else if (!(mainUserDataHistory.data.records[i].endcontext[0].username == user) && !(mainUserDataHistory.data.records[i + 1].endcontext[0].username == user)) {
                    badMood++;
                    losses++;
                    // If the user lost the match but won the previous match, increment over confident score
                } else if (!(mainUserDataHistory.data.records[i].endcontext[0].username == user) && mainUserDataHistory.data.records[i + 1].endcontext[0].username == user) {
                    overConfident++;
                    losses++;
                    // If the user won the match but lost the previous match, increment vengeance score
                } else if (mainUserDataHistory.data.records[i].endcontext[0].username == user && !(mainUserDataHistory.data.records[i + 1].endcontext[0].username == user)) {
                    vengeance++;
                    wins++;
                } else {
                    // console.log("oh nyooo")
                }
            }

            var goodMoodScore = goodMood / (goodMood + overConfident);
            var badMoodScore = badMood / (badMood + vengeance);
            var overConfidentScore = overConfident / (overConfident + goodMood);
            var vengeanceScore = vengeance / (vengeance + badMood);

            // Remove loading tag
            // document.getElementById("loading").remove();

            if (mainUserDataHistory.data.records[0].endcontext[0].username == user) {
                if (goodMoodScore > 0.75) {
                    // console.log("Good mood: This user tends to continue winning if they won their previous match (Winrate " + (goodMoodScore * 100).toFixed(precision) + "%)");
                    addTrait(
                        "GOOD MOOD",
                        "This user tends to continue winning if they won their previous match (Winrate " + (goodMoodScore * 100).toFixed(precision) + "%)",
                        "#b6b3f4"
                    );
                } else if (overConfidentScore > 0.75) {
                    // console.log("Over confident: This user tends to lose if they won their previous match. (Winrate " + overConfidentScore * 100 + "%)");
                    addTrait(
                        "OVER CONFIDENT",
                        "This user tends to lose if they won their previous match. (Winrate " + (100 - overConfidentScore * 100).toFixed(precision) + "%)",
                        1,
                        "#f4b6b3"
                    );
                } else {
                    // console.log("Level headed: This user's winrate is not heavily affected if they won their previous match. (Winrate " + ((goodMoodScore) * 100).toFixed(precision) + "%)");
                    addTrait(
                        "LEVEL HEADED",
                        "This user's winrate is not heavily affected if they won their previous match. (Winrate " + (goodMoodScore * 100).toFixed(precision) + "%)",
                        "#b6b3f4"
                    );
                }
            } else {
                if (badMoodScore > 0.75) {
                    // console.log("Bad mood: This user tends to continue losing if they lost their previous match. (Winrate " + (badMoodScore * 100).toFixed(precision) + "%)");
                    addTrait(
                        "BAD MOOD",
                        "This user tends to continue losing if they lost their previous match. (Winrate " + (100 - badMoodScore * 100).toFixed(precision) + "%)",
                        "#f4b6b3"
                    );
                } else if (vengeanceScore > 0.75) {
                    // console.log("Vengeance: This user tends to win if they lost their previous match. (Winrate " + (vengeanceScore * 100).toFixed(precision) + "%)");
                    addTrait("VENGEANCE", "This user tends to win if they lost their previous match. (Winrate " + (vengeanceScore * 100).toFixed(precision) + "%)", "#b6b3f4");
                } else {
                    // console.log("Level headed: This user's winrate is not heavily affected if they lost their previous match. (Winrate " + ((vengeanceScore) * 100).toFixed(precision) + "%)");
                    addTrait(
                        "LEVEL HEADED",
                        "This user's winrate is not heavily affected if they lost their previous match. (Winrate " + (vengeanceScore * 100).toFixed(precision) + "%)",
                        "#b6b3f4"
                    );
                }
            }
            // console.log("This user's winrate is " + (100 * wins / 9).toFixed(precision) + "%.");

            if (calculatePercentile(userPps, pps).toFixed(precision) > 75) {
                addTrait("HIGH PPS", "This user has a high average PPS compared to other players (Top " + calculatePercentile(userPps, pps).toFixed(precision) + " %)", "#b6b3f4");
            } else if (calculatePercentile(userPps, pps).toFixed(precision) < 25) {
                addTrait("LOW PPS", "This user has a low average PPS compared to other players (Bottom " + calculatePercentile(userPps, pps).toFixed(precision) + " %)", "#f4b6b3");
            }
            if (calculatePercentile(userApm, apm).toFixed(precision) > 75) {
                addTrait("HIGH APM", "This user has a high average APM compared to other players (Top " + calculatePercentile(userApm, apm).toFixed(precision) + " %)", "#b6b3f4");
            } else if (calculatePercentile(userApm, apm).toFixed(precision) < 25) {
                addTrait("LOW APM", "This user has a low average APM compared to other players (Bottom " + calculatePercentile(userApm, apm).toFixed(precision) + " %)", "#f4b6b3");
            }
            if (calculatePercentile(userVs, vs).toFixed(precision) > 75) {
                addTrait("HIGH VS", "This user has a high average VS compared to other players (Top " + calculatePercentile(userVs, vs).toFixed(precision) + " %)", "#b6b3f4");
            } else if (calculatePercentile(userVs, vs).toFixed(precision) < 25) {
                addTrait("LOW VS", "This user has a low average VS compared to other players (Bottom " + calculatePercentile(userVs, vs).toFixed(precision) + " %)", "#f4b6b3");
            }

            var openerScore = Number(
                Number(
                    Number(
                        (userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) -
                            1 +
                            (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * 0.75 +
                            (userVsapm / (-(((statrank - 16) / 36) ** 2) + 2.133) - 1) * -10 +
                            (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * 0.75 +
                            (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * -0.25) /
                            3.5
                    ) + 0.5
                ).toFixed(4)
            );
            var plonkScore = Number(
                Number(
                    (userGe / (statrank / 350 + 0.005948424455 * 3.8 ** ((statrank - 6.1) / 4) + 0.006) -
                        1 +
                        (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) +
                        (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * 0.75 +
                        (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * -1) /
                        2.73 +
                        0.5
                ).toFixed(4)
            );
            var strideScore = Number(
                Number(
                    ((userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) - 1) * -0.25 +
                        (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) +
                        (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * -2 +
                        (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * -0.5) *
                        0.79 +
                        0.5
                ).toFixed(4)
            );
            var infdsScore = Number(
                Number(
                    (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) -
                        1 +
                        (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * -0.75 +
                        (userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) - 1) * 0.5 +
                        (userVsapm / (-(((statrank - 16) / 36) ** 2) + 2.133) - 1) * 1.5 +
                        (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * 0.5) *
                        0.9 +
                        0.5
                ).toFixed(4)
            );

            var playstyle = [openerScore, plonkScore, strideScore, infdsScore];

            var descriptions = [
                { title: "OPENER", description: "This user is likely an opener main" },
                { title: "PLONKER", description: "This user is likely a plonker" },
                { title: "STRIDER", description: "This user is likely a strider" },
                { title: "INF DS'ER", description: "This user is likely an infnite downstacker" },
            ];

            var mainPlaystyle = playstyle.indexOf(Math.max(...playstyle));
            playstyle[mainPlaystyle] = -playstyle[mainPlaystyle];
            var secondaryPlaystyle =
                playstyle[playstyle.indexOf(Math.max(...playstyle))] > -0.75 * playstyle[mainPlaystyle] ? playstyle.indexOf(Math.max(...playstyle)) : undefined;

            // console.log(secondaryPlaystyle)
            // console.log(mainPlaystyle);
            // console.log(playstyle);

            // console.log("Opener score: " + openerScore);
            // console.log("Plonk score: " + plonkScore);
            // console.log("Stride score: " + strideScore);
            // console.log("Infds score: " + infdsScore);

            var playstyleWinrate = [
                { wins: 0, played: 0 },
                { wins: 0, played: 0 },
                { wins: 0, played: 0 },
                { wins: 0, played: 0 },
            ];

            for (let i = 0; i < mainUserMatchHistoryData.length; i++) {
                let userPps = mainUserMatchHistoryData[i].data.user.league.pps;
                let userApm = mainUserMatchHistoryData[i].data.user.league.apm;
                let userVs = mainUserMatchHistoryData[i].data.user.league.vs;
                let userApp = userApm / 60 / userPps;
                let userVsapm = userVs / userApm;
                let userDsps = userVs / 100 - userApm / 60;
                let userDspp = userDsps / userPps;
                let userGe = (2 * userApp * userDsps) / userPps;

                let srarea = userApm * 0 + userPps * 135 + userVs * 0 + userApp * 290 + userDsps * 0 + userDspp * 700 + userGe * 0;
                let statrank = 11.2 * Math.atan((srarea - 93) / 130) + 1;

                let openerScore = Number(
                    Number(
                        Number(
                            (userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) -
                                1 +
                                (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * 0.75 +
                                (userVsapm / (-(((statrank - 16) / 36) ** 2) + 2.133) - 1) * -10 +
                                (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * 0.75 +
                                (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * -0.25) /
                                3.5
                        ) + 0.5
                    ).toFixed(4)
                );
                let plonkScore = Number(
                    Number(
                        (userGe / (statrank / 350 + 0.005948424455 * 3.8 ** ((statrank - 6.1) / 4) + 0.006) -
                            1 +
                            (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) +
                            (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * 0.75 +
                            (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * -1) /
                            2.73 +
                            0.5
                    ).toFixed(4)
                );
                let strideScore = Number(
                    Number(
                        ((userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) - 1) * -0.25 +
                            (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) +
                            (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * -2 +
                            (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) - 1) * -0.5) *
                            0.79 +
                            0.5
                    ).toFixed(4)
                );
                let infdsScore = Number(
                    Number(
                        (userDspp / (0.02136327583 * 14 ** ((statrank - 14.75) / 3.9) + statrank / 152 + 0.022) -
                            1 +
                            (userApp / (0.1368803292 * 1.0024 ** (statrank ** 5 / 2800) + statrank / 54) - 1) * -0.75 +
                            (userApm / srarea / (0.069 * 1.0017 ** (statrank ** 5 / 4700) + statrank / 360) - 1) * 0.5 +
                            (userVsapm / (-(((statrank - 16) / 36) ** 2) + 2.133) - 1) * 1.5 +
                            (userPps / srarea / (0.0084264 * 2.14 ** (-2 * (statrank / 2.7 + 1.03)) - statrank / 5750 + 0.0067) - 1) * 0.5) *
                            0.9 +
                            0.5
                    ).toFixed(4)
                );

                let playstyle = [openerScore, plonkScore, strideScore, infdsScore];
                let mainPlaystyle = playstyle.indexOf(Math.max(...playstyle));
                playstyle[mainPlaystyle] = -playstyle[mainPlaystyle];
                let secondaryPlaystyle =
                    playstyle[playstyle.indexOf(Math.max(...playstyle))] > -0.75 * playstyle[mainPlaystyle] ? playstyle.indexOf(Math.max(...playstyle)) : undefined;

                if (mainPlaystyle >= 0) playstyleWinrate[mainPlaystyle].played++;
                Number.isInteger(secondaryPlaystyle) ? playstyleWinrate[secondaryPlaystyle].played++ : "mrow" == "mrow";

                // If the main user won against this user...
                if (mainUserMatchHistory[i]) {
                    if (mainPlaystyle >= 0) playstyleWinrate[mainPlaystyle].wins++;
                    Number.isInteger(secondaryPlaystyle) ? playstyleWinrate[secondaryPlaystyle].wins++ : "mrow" == "mrow";
                }
            }
            // TODO: Optimize it. Too bad!

            // console.log(playstyleWinrate);
            var playstyleWinrateDescriptions = ["openers", "plonkers", "striders", "inf ds'ers"];
            for (let i = 0; i < playstyleWinrate.length; i++) {
                if (playstyleWinrate[i].wins / playstyleWinrate[i].played > 0.65) {
                    addTrait(
                        "WINS AGAINST " + playstyleWinrateDescriptions[i].toUpperCase(),
                        "This user has a high winrate against " +
                            playstyleWinrateDescriptions[i] +
                            ". (Winrate " +
                            ((100 * playstyleWinrate[i].wins) / playstyleWinrate[i].played).toFixed(precision) +
                            "%)",
                        "#b6b3f4"
                    );
                } else if (playstyleWinrate[i].wins / playstyleWinrate[i].played < 0.35) {
                    addTrait(
                        "LOSES AGAINST " + playstyleWinrateDescriptions[i].toUpperCase(),
                        "This user has a low winrate against " +
                            playstyleWinrateDescriptions[i] +
                            ". (Winrate " +
                            ((100 * playstyleWinrate[i].wins) / playstyleWinrate[i].played).toFixed(precision) +
                            "%)",
                        "#f4b6b3"
                    );
                }
            }

            Number.isInteger(secondaryPlaystyle) ? addTrait(descriptions[secondaryPlaystyle].title, descriptions[secondaryPlaystyle].description) : "nya" == "nya";

            addTrait(descriptions[mainPlaystyle].title, descriptions[mainPlaystyle].description);
            // console.log("User statistics calculated in " + (Date.now() - tStart) / 1000 + " seconds!")
        }

        await calculateUserStats();
    }

    return result;
}

client.on("messageCreate", async function (message) {
    // console.log(message.content);
    if (message.content.startsWith(prefix)) {
        let split = message.content.split(" ");
        let command = split[0].toLowerCase();
        command = command.slice(1); // assuming prefix is legnth 1, remove prefix
        let command_arguments = split.slice(1); // not including command

        if (command == "fumen") {
            console.log(command);
            console.log(command_arguments);

            if (command_arguments.length == 0 || command_arguments[0].toLowerCase() == "help") {
                await message.channel.send(
                    `fumen command.\nUsage: ${prefix}fumen fumen_code {size=22} {height=undefined} {page_index=0} {delay=0} {start=0} {end=undefined}\nOptional arguments are in {braces}, default usage is to just provide the fumen code.\nProviding page_index will generate a PNG of that single frame of the fumen`
                );
                // should I learn how to do a fancy embed idk
                return;
            }

            let fumen = await parse_fumen_argument(command_arguments[0]);
            if (fumen == undefined) {
                await message.channel.send("Could not parse fumen.");
                return;
            }
            console.log(fumen);

            let size = 22;
            let height = undefined;
            let page = 0;
            let start = 0;
            let end = undefined;
            let delay = 500;

            if (command_arguments.length > 1 && command_arguments[1] != "undefined") size = parseInt(command_arguments[1]);
            if (command_arguments.length > 2 && command_arguments[2] != "undefined") height = parseInt(command_arguments[2]);
            if (command_arguments.length > 3 && command_arguments[3] != "undefined") page = parseInt(command_arguments[3]);
            if (command_arguments.length > 4 && command_arguments[4] != "undefined") delay = parseInt(command_arguments[4]);
            if (command_arguments.length > 5 && command_arguments[5] != "undefined") start = parseInt(command_arguments[5]);
            if (command_arguments.length > 6 && command_arguments[6] != "undefined") end = parseInt(command_arguments[6]);

            try {
                let pages = decoder.decode(fumen);

                if (pages.length == 1 || page != 0) {
                    var canvas = draw(pages[page], size, height, false);
                    var buffer = canvas.toBuffer("image/png");
                    fs.writeFileSync("output.png", buffer);
                    await message.channel.send({ files: ["output.png"] });
                } else if (pages.length > 1) {
                    let gif = drawFumens(pages, size, height, start, end, false, delay);
                    await gif.createReadStream().pipe(fs.createWriteStream("output.gif"));
                    await gif.finish();
                    await message.channel.send({ files: ["output.gif"] });
                }
            } catch (error) {
                console.error(error);
            }
        }

        if (command == "help") {
            // idk add this command later
        }

        if (command == "verge") {
            console.log(command);
            console.log(command_arguments);

            let username = command_arguments[0];
            if (username != undefined) {
                let result = await verge(username);
                await message.channel.send(result);
            }
        }
    }
});

client.login(token);
