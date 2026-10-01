using '../main.bicep'

param environment = 'production'
param location = 'eastus2'
param secondaryLocation = 'centralus'
param resourceGroupName = 'rg-toh-consumer-production'

param aiModelDeploymentEnabled = false

param consumerContainerAppsEnvironmentEnabled = true
param consumerRegionalFailoverEnabled = true
param consumerEdgeEnabled = false
param consumerCustomDomainHostName = 'theouthaven.com'
param consumerWwwCustomDomainHostName = 'www.theouthaven.com'

param otaEnabled = true
param otaCustomDomainHostName = 'updates.theouthaven.com'

param consumerShortLinkBaseUrl = 'https://outhvn.com'
param consumerShortLinkHost = 'outhvn.com'
