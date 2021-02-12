const chromeLauncher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const fs = require('fs') 
const commandLineUsage = require('command-line-usage')

//Command line interface
const sections = [
  {
    header: 'JScoverage Usage',
    content: 'node main.js <flag> <input_URL_file>'
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'summary',
        alias: 's',
        description: 'Generate a coverage summary report',
        type: Boolean
      },
      {
        name: 'detail',
        alias: 'd',
        description: 'Generate a detailed coverage report',
        type: Boolean
      }
    ]
  }
]
const usage = commandLineUsage(sections)

//console.log(process.argv.length)

if(process.argv.length < 3){
  console.log(usage);
  return;
}

var input;
var isDetailed = false;
var isSummary = false;
if(process.argv.length == 4){
  if(process.argv[2] == "-s" || process.argv[2] == "--summary"){
    isSummary = true;
    input = process.argv[3];
  } else if(process.argv[2] == "-d" || process.argv[2] == "--detail"){
    isDetailed = true;
    input = process.argv[3];
  } else{
    console.log(usage);
    return;
  }
} else {
  console.log(usage);
  return;
}

const launchChrome = () =>
  chromeLauncher.launch({
    chromeFlags: ['--disable-gpu', '--headless']
  });

var websites = [];

fs.readFile(input, (err, data) => { 
  if (err) throw err; 
  var raw = data.toString();
  //console.log(raw); 
  websites = raw.split("\n");
  //console.log(websites.length); 
  var i = 0;
  for (i = 0; i < websites.length; i++) {
    websites[i] = "https://".concat(websites[i]);
  }
  initiate_coverage(websites);
});

async function initiate_coverage(websites){
  //console.log("Websites num:", websites.length);
  //for (i = 0; i < websites.length; i++) {
  //console.log(websites);
  launchChrome()
  .then(async chrome => {
    const protocol = await CDP({port: chrome.port});
    try {
      for (var i = 0; i < websites.length; i++) {
        const {Page, Profiler} = protocol;
        await Profiler.enable();
        await Page.enable();
  
        await Profiler.startPreciseCoverage();
  
        Page.navigate({url: websites[i]});
        await Page.loadEventFired();
  
        const res = await Profiler.takePreciseCoverage();
        //console.log(res);
        await Profiler.stopPreciseCoverage();
  
        //Calculating total coverage
        if(isSummary){
          var index = 0;
          var total = 0;
          var unused = 0;
          for (index = 0; index < res.result.length; index++){
            const coverage = calculateCoverage(res.result[index]);
            total += coverage.total;
            unused += coverage.unused;
            //console.log(res.result[index].url);
            //console.log(coverage);
          }
          var percentUnused = unused / total;
          console.log("URL:", websites[i]);
          console.log("Total bytes:", total);
          console.log("Total unused bytes:", unused);
          console.log("Total unused percentage:", percentUnused);
        }
        if(isDetailed){
          //Pass in functions in each url, combine scriptID with same URL
          var total_map = new Map();
          var unused_map = new Map();

          var index = 0;
          for (index = 0; index < res.result.length; index++){
            const coverage = calculateCoverage(res.result[index]);

            if(total_map.has(res.result[index].url)){
              let tmp = total_map.get(res.result[index].url);
              total_map.set(res.result[index].url, tmp + coverage.total);
            } else {
              total_map.set(res.result[index].url, coverage.total);
            }
            if(unused_map.has(res.result[index].url)){
              let tmp = unused_map.get(res.result[index].url);
              unused_map.set(res.result[index].url, tmp + coverage.unused);
            } else {
              unused_map.set(res.result[index].url, coverage.unused);
            }
            //console.log(res.result[index].url);
            //console.log(coverage);
          }
          console.log("URL:", websites[i]);

          const it_map = total_map[Symbol.iterator]();

          for(const item of it_map){
            console.log("Accessing:", item[0]);
            console.log("Total bytes:", item[1]);
            console.log("Total unused bytes:", unused_map.get(item[0]));
            console.log("Total unused percentage:", unused_map.get(item[0])/item[1]);
          }
        }
      } 

    } catch (err) {
      console.error(err);
    } finally {
      protocol.close();
      chrome.kill();
    }
  })
  .catch(err => console.error(err));
  //}
};


// Measuring coverage based on _processJSCoverage() in https://github.com/ChromeDevTools/devtools-frontend/blob/master/front_end/coverage/CoverageModel.js
function calculateCoverage(scriptCoverage) {
  //const src = 'https://paulirish.disqus.com/count.js';

  // const scriptCoverage = res.result.find(script => script.url === src);
  // console.log(res);
  // if (!scriptCoverage) {
  //   console.log(`:coverage() > ${src} not found on the page.`);
  //   return new Error(`Couldn't locat script ${src} on the page.`);
  // }

  if (scriptCoverage && scriptCoverage.functions && scriptCoverage.functions.length) {
    const coverageData = scriptCoverage.functions.reduce(
      (fnAccum, coverageStats) => {
        const functionStats = coverageStats.ranges.reduce(
          (rangeAccum, range) => {
            return {
              total: range.endOffset > rangeAccum.total ? range.endOffset : rangeAccum.total,
              unused:
                rangeAccum.unused + (range.count === 0 ? range.endOffset - range.startOffset : 0)
            };
          },
          {
            total: 0,
            unused: 0
          }
        );

        return {
          total: functionStats.total > fnAccum.total ? functionStats.total : fnAccum.total,
          unused: fnAccum.unused + functionStats.unused
        };
      },
      {
        total: 0,
        unused: 0
      }
    );

    return Object.assign(coverageData, {
      percentUnused: coverageData.unused / coverageData.total
    });
  }
  return Error('unexpected');
};