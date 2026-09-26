using '../main.bicep'

param environment = 'production'
param location = 'eastus2'
param secondaryLocation = 'centralus'
param resourceGroupName = 'rg-toh-consumer-production'

param aiModelDeploymentEnabled = false

param consumerContainerAppsEnvironmentEnabled = true
param consumerRegionalFailoverEnabled = true
param consumerEdgeEnabled = false

param otaEnabled = true
