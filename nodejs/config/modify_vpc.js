const fs = require('fs');
const YAML = require('yaml');

modifyVpcSettingsPerEnvironment();

function modifyVpcSettingsPerEnvironment() {
  const fileName = './vpc-defintion.yml';
  const fileObject = YAML.parse(fs.readFileSync(fileName, 'utf8'));
  if (getEnvironmentNameFromSecret() !== 'prod') {
    fileObject.customVpc.subnetIds.splice(1, 1);
  }

  fs.writeFileSync(fileName, YAML.stringify(fileObject));
}

function getEnvironmentNameFromSecret() {
  const fileName = './secrets.json';
  const fileObject = JSON.parse(fs.readFileSync(fileName).toString());
  return fileObject.ENV;
}
