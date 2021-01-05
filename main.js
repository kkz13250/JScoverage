const CDP = require("chrome-remote-interface")
var fs = require("fs");
fs.unlinkSync('coverage.txt')
var report = fs.createWriteStream('coverage.txt', {
    flags: 'a'
  })

CDP((client) => {
  // extract domains
  const {
    Network,
    Page,
    Profiler
  } = client;
  
  // setup handlers
  Network.requestWillBeSent((params) => {
    console.log(params.request.url);
  });

  
  // enable events then start!
  Promise.all([
      Network.enable(),
      Page.enable(),
      Profiler.enable(),
      Profiler.startPreciseCoverage()
    ])
    .then(() => {
      return Page.navigate({
        url: 'http://localhost:8070/'
      });
    })
    //.then(() => Profiler.getBestEffortCoverage())
    .then(() => Profiler.takePreciseCoverage())
    .then((data) => data.result.forEach((el) => {
      report.write('-----' + el.url + '\n')
      console.log('-----', el.url)
      el.functions.forEach((el) => {
        report.write('Function Name:' + el.functionName + '\n')
        //var range = "" + el.ranges.startOffset + ' ' + el.ranges.endOffset + ' ' + el.ranges.count
        report.write('ranges' + JSON.stringify(el.ranges) + '\n')
        console.log('Function Name:', el.functionName)
        console.log('ranges', el.ranges)
      })
    }))
    .then(() => {
        //report.end()
        return Profiler.stopPreciseCoverage()})
    .catch((err) => {
      console.error(err);
      client.close();
    });
}).on('error', (err) => {
  // cannot connect to the remote endpoint
  console.error(err);
});