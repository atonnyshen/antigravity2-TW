const fs = require('fs');
const path = require('path');

const dictsDir = path.join(__dirname, '../dicts');
const dictsTwDir = path.join(__dirname, '../dicts_tw');

function compareDicts() {
    let hasError = false;
    
    if (!fs.existsSync(dictsDir) || !fs.existsSync(dictsTwDir)) {
        console.error('Error: dicts or dicts_tw directory does not exist.');
        process.exit(1);
    }
    
    const scFiles = fs.readdirSync(dictsDir).filter(f => f.endsWith('.json'));
    const tcFiles = fs.readdirSync(dictsTwDir).filter(f => f.endsWith('.json'));
    
    // Check if the set of files is identical
    const allFiles = Array.from(new Set([...scFiles, ...tcFiles])).sort();
    
    for (const file of allFiles) {
        const scFilePath = path.join(dictsDir, file);
        const tcFilePath = path.join(dictsTwDir, file);
        
        if (!fs.existsSync(scFilePath)) {
            console.error(`Error: File ${file} exists in dicts_tw but is missing in dicts.`);
            hasError = true;
            continue;
        }
        if (!fs.existsSync(tcFilePath)) {
            console.error(`Error: File ${file} exists in dicts but is missing in dicts_tw.`);
            hasError = true;
            continue;
        }
        
        try {
            const scData = JSON.parse(fs.readFileSync(scFilePath, 'utf8'));
            const tcData = JSON.parse(fs.readFileSync(tcFilePath, 'utf8'));
            
            const scKeys = Object.keys(scData);
            const tcKeys = Object.keys(tcData);
            
            const scKeySet = new Set(scKeys);
            const tcKeySet = new Set(tcKeys);
            
            // Check keys in SC but not in TC
            for (const key of scKeys) {
                if (!tcKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts but is missing in dicts_tw.`);
                    hasError = true;
                }
            }
            
            // Check keys in TC but not in SC
            for (const key of tcKeys) {
                if (!scKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts_tw but is missing in dicts.`);
                    hasError = true;
                }
            }
        } catch (e) {
            console.error(`Error parsing JSON file ${file}:`, e.message);
            hasError = true;
        }
    }
    
    if (hasError) {
        process.exit(1);
    } else {
        console.log('All dictionaries are perfectly aligned!');
        process.exit(0);
    }
}

compareDicts();
