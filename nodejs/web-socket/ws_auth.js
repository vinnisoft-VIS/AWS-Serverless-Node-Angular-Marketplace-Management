const jose = require('node-jose');
const Axios = require('axios');
const HttpAxiosService = require('../integration/service/http_axios_service');

const generatePolicy = function (principalId, effect, resource) {
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    const policyDocument = {};
    // default version
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];
    const statementOne = {};
    // default action
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  return authResponse;
};
const generateAllow = function (principalId, resource) {
  return generatePolicy(principalId, 'Allow', resource);
};
module.exports.auth = async (event, context) => {
  // Read input parameters from event
  const { methodArn } = event;
  const token = event.queryStringParameters.Authorization;

  if (!token) {
    return context.fail('Unauthorized');
  }
  // Get the kid from the headers prior to verification
  const sections = token.split('.');
  let header = jose.util.base64url.decode(sections[0]);
  header = JSON.parse(header);
  const { kid } = header;
  // Fetch known valid keys
  const options = {};
  options.url = 'https://cognito-idp.' + '@aws_region@' + '.amazonaws.com/' + '@userPoolId@' + '/.well-known/jwks.json';
  const axiosOptions = HttpAxiosService.buildAxiosRequestOptions(options, HttpAxiosService.HTTP_METHODS.GET);
  const response = await Axios(axiosOptions);

  if (response.status === 200) {
    const { data } = response;
    const { keys } = data;
    const foundKey = keys.find((key) => key.kid === kid);

    if (!foundKey) {
      context.fail('Public key not found in jwks.json');
    } else {
      try {
        const result = await jose.JWK.asKey(foundKey);
        const keyVerify = jose.JWS.createVerify(result);
        const verificationResult = await keyVerify.verify(token);
        const claims = JSON.parse(verificationResult.payload);
        // Verify the token expiration
        const currentTime = Math.floor(new Date() / 1000);
        if (currentTime > claims.exp) {
          console.error('Token expired!');
          context.fail('Token expired!');
        } else if (claims.aud !== '@clientId@') {
          console.error('Token wasn\'t issued for target audience');
          context.fail('Token was not issued for target audience');
        } else {
          context.succeed(generateAllow('me', methodArn));
        }
      } catch (error) {
        console.error('Unable to verify token', error);
        context.fail('Signature verification failed');
      }
    }
  } else {
    // Unable to download JWKs, fail the call
    context.fail('error');
  }
};
