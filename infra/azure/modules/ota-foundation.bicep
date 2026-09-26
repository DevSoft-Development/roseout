param environment string
param location string
param secondaryLocation string
param tags object

var envShort = environment == 'production' ? 'prod' : 'stg'
var suffix = substring(uniqueString(resourceGroup().id), 0, 8)
var storageName = 'tohota${envShort}${suffix}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: {
    name: environment == 'production' ? 'Standard_RAGRS' : 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    allowBlobPublicAccess: true
    accessTier: 'Hot'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 14
    }
  }
}

resource webContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
}

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: 'afd-toh-ota-${envShort}'
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: 'toh-ota-${envShort}-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

var primaryWebHost = replace(replace(storage.properties.primaryEndpoints.web, 'https://', ''), '/', '')
var secondaryWebHost = environment == 'production'
  ? replace(replace(storage.properties.secondaryEndpoints.web, 'https://', ''), '/', '')
  : primaryWebHost

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'ota-storage'
  properties: {
    sessionAffinityState: 'Disabled'
    healthProbeSettings: {
      probePath: '/health.json'
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
    hostName: primaryWebHost
    httpPort: 80
    httpsPort: 443
    originHostHeader: primaryWebHost
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource secondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = if (environment == 'production') {
  parent: originGroup
  name: 'secondary'
  properties: {
    hostName: secondaryWebHost
    httpPort: 80
    httpsPort: 443
    originHostHeader: secondaryWebHost
    priority: 2
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'ota'
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
  dependsOn: environment == 'production' ? [
    primaryOrigin
    secondaryOrigin
  ] : [
    primaryOrigin
  ]
}

output storageAccountName string = storage.name
output primaryWebEndpoint string = storage.properties.primaryEndpoints.web
output secondaryWebEndpoint string = environment == 'production' ? storage.properties.secondaryEndpoints.web : ''
output frontDoorProfileName string = profile.name
output frontDoorEndpointHostName string = endpoint.properties.hostName
output webContainerName string = webContainer.name
