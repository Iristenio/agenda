import { render } from 'preact';
import { App } from './ui/App';
import { garantirDadosIniciais, pedirArmazenamentoPersistente } from './dados/repositorio';
import { iniciarSincronizacao } from './sync/motor';
import './estilos/global.css';
import './estilos/formularios.css';
import './estilos/tarefas.css';
import './estilos/calendario.css';
import './estilos/equipe.css';
import './estilos/ajustes.css';

garantirDadosIniciais().then(() => iniciarSincronizacao());
pedirArmazenamentoPersistente();

render(<App />, document.getElementById('app')!);
