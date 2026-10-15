# helm y kubernetes se configuran con las credenciales del cluster que
# crea este mismo workspace. Por eso bootstrap.sh aplica en dos fases:
# primero solo kind_cluster (-target) y despues todo lo demas, para que
# estos providers nunca intenten hablar con un cluster inexistente.
provider "kubernetes" {
  host                   = kind_cluster.sa_p9.endpoint
  client_certificate     = kind_cluster.sa_p9.client_certificate
  client_key             = kind_cluster.sa_p9.client_key
  cluster_ca_certificate = kind_cluster.sa_p9.cluster_ca_certificate
}

provider "helm" {
  kubernetes = {
    host                   = kind_cluster.sa_p9.endpoint
    client_certificate     = kind_cluster.sa_p9.client_certificate
    client_key             = kind_cluster.sa_p9.client_key
    cluster_ca_certificate = kind_cluster.sa_p9.cluster_ca_certificate
  }
}
