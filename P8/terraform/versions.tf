terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
  }
}

# Apunta al cluster kind local ("kind create cluster --name sa-p8"
# genera automaticamente el contexto "kind-sa-p8" en tu kubeconfig).
#
# El dia de la calificacion, si se recrea el cluster con otro nombre,
# solo hay que ajustar var.kube_context -- ver variables.tf.
provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}
