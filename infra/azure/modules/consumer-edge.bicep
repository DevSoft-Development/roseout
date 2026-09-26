param environment string
param tags object
param primaryOriginHostName string
param secondaryOriginHostName string
param healthProbePath string = '/api/health/azure'

var envShort = environment == 'production' ? 'prod' : 'stg'
var suffix = substring(uniqueString(resourceGroup().id), 0, 8)

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: 'afd-toh-consumer-${envShort}'
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: 'toh-consumer-${envShort}-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'consumer-regions'
  properties: {
    sessionAffinityState: 'Disabled'
    healthProbeSettings: {
      probePath: healthProbePath
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 0
    }
  }
}

resource primaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: 'primary'
  properties: {
    hostName: primaryOriginHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: primaryOriginHostName
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource secondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: originGroup
  name: 'secondary'
  properties: {
    hostName: secondaryOriginHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: secondaryOriginHostName
    priority: 2
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'consumer'
  properties: {
    originGroup: {
      id: originGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
  dependsOn: [
    primaryOrigin
    secondaryOrigin
  ]
}

output profileName string = profile.name
output endpointName string = endpoint.name
output endpointHostName string = endpoint.properties.hostName
output primaryOriginHostName string = primaryOriginHostName
output secondaryOriginHostName string = secondaryOriginHostName
