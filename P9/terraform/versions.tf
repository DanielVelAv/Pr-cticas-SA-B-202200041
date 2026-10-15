# Estado remoto en HCP Terraform (org Sa9, workspace sa-p9).
# Execution mode = Local: el apply corre en la maquina del operador
# (kind es local), HCP solo guarda el estado y aplica el BLOQUEO.
terraform {
  required_version = ">= 1.9.0"

  cloud {
    organization = "Sa9"
    workspaces {
      name = "sa-p9"
    }
  }

  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = "0.11.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "2.38.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "4.4.1"
    }
    null = {
      source  = "hashicorp/null"
      version = "3.3.2"
    }
  }
}
